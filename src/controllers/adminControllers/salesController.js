import Order from "../../model/orderModel.js";
import exceljs from "exceljs";
import PDFDocument from "pdfkit";

const getDateRange = (filter) => {
    const now = new Date();
    let startDate, endDate;

    switch (filter) {
        case 'daily':
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'weekly':
            startDate = new Date(now);
            // Get Sunday of the current week
            startDate.setDate(now.getDate() - now.getDay());
            startDate.setHours(0, 0, 0, 0);

            endDate = new Date(now); // Up to current time/end of today
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
        default: // 'custom' or all time
            startDate = null;
            endDate = null;
    }
    return { startDate, endDate };
};

const getSalesReport = async (req, res) => {
    try {
        const { filter, startDate, endDate, page = 1 } = req.query;
        let dateQuery = {};

        // 1. Date Filtering Logic
        if (filter === 'custom' && startDate && endDate) {
            dateQuery = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
                }
            };
        } else if (filter && filter !== 'all') {
            const range = getDateRange(filter);
            dateQuery = {
                createdAt: { $gte: range.startDate, $lte: range.endDate }
            };
        }

        // Only consider valid orders for sales report
        const matchStage = {
            ...dateQuery,
            // Include Returned/Partially Returned so we can calculate their refunds against the revenue.
            orderStatus: { $nin: ['Cancelled', 'Failed', 'Pending'] },
            "payment.status": { $ne: "Failed" }
        };

        // 2. Metrics Aggregation
        const metrics = await Order.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: "$totalAmount" },
                    totalDiscount: { $sum: "$discount" },
                    totalRefunded: {
                        $sum: {
                            $max: [
                                { $ifNull: ["$refundSummary.totalRefunded", 0] },
                                { $sum: "$items.refund.amount" }
                            ]
                        }
                    },
                    productsSold: { $sum: { $size: "$items" } } // Approximate, better to unwind if exact qty needed
                }
            }
        ]);

        const stats = metrics[0] || { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, totalRefunded: 0, productsSold: 0 };
        stats.totalRevenue = Math.round(stats.totalRevenue * 100) / 100;
        stats.totalDiscount = Math.round(stats.totalDiscount * 100) / 100;
        stats.totalRefunded = Math.round(stats.totalRefunded * 100) / 100;


        // 3. Paginated Order List
        const limit = 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find(matchStage)
            .populate('userId', 'fullName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalDocs = await Order.countDocuments(matchStage);
        const totalPages = Math.ceil(totalDocs / limit);


        // 4. Chart Data (Sales Over Time)
        // Group by day for the selected range
        const salesChart = await Order.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    dailySales: { $sum: "$totalAmount" },
                    dailyRefunds: {
                        $sum: {
                            $max: [
                                { $ifNull: ["$refundSummary.totalRefunded", 0] },
                                { $sum: "$items.refund.amount" }
                            ]
                        }
                    },
                    dailyOrders: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 5. Payment Methods Data
        const paymentChart = await Order.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$payment.method",
                    count: { $sum: 1 }
                }
            }
        ]);


        res.render('admin/salesReport', {
            orders,
            stats,
            currentPage: Number(page),
            totalPages,
            filter,
            startDate,
            endDate,
            salesChart: JSON.stringify(salesChart),
            paymentChart: JSON.stringify(paymentChart)
        });

    } catch (error) {
        console.error("Sales Report Error:", error);
        res.status(500).render('error/500', { message: "Failed to load sales report" });
    }
};

// --- Downloader Functions ---

const downloadReport = async (req, res) => {
    try {
        const { format, filter, startDate, endDate } = req.query;
        let dateQuery = {};
        let dateRangeStr = "All Time";

        if (filter === 'custom' && startDate && endDate) {
            const sDate = new Date(startDate);
            const eDate = new Date(endDate);
            dateRangeStr = `${sDate.toLocaleDateString()} to ${eDate.toLocaleDateString()}`;
            dateQuery = {
                createdAt: {
                    $gte: sDate,
                    $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
                }
            };
        } else if (filter && filter !== 'all') {
            const range = getDateRange(filter);
            dateRangeStr = `${range.startDate.toLocaleDateString()} to ${range.endDate.toLocaleDateString()}`;
            dateQuery = {
                createdAt: { $gte: range.startDate, $lte: range.endDate }
            };
        }

        const orders = await Order.find({
            ...dateQuery,
            orderStatus: { $nin: ['Cancelled', 'Failed', 'Pending'] },
            "payment.status": { $ne: "Failed" }
        }).populate('userId', 'fullName').lean();

        // Calculate Totals
        const totalSales = orders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
        const totalDiscount = orders.reduce((acc, order) => acc + (order.discount || 0), 0);

        let totalRefunded = 0;
        orders.forEach(order => {
            let itemRefunds = 0;
            if (order.items && order.items.length > 0) {
                order.items.forEach(item => {
                    if (item.refund && item.refund.amount > 0) {
                        itemRefunds += item.refund.amount;
                    }
                });
            }
            order.calculatedTotalRefund = Math.max(order.refundSummary?.totalRefunded || 0, itemRefunds);
            totalRefunded += order.calculatedTotalRefund;
        });

        const totalOrders = orders.length;

        if (format === 'excel') {
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');

            // Title and Date Range
            worksheet.mergeCells('A1', 'H1');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'PawPalace Sales Report';
            titleCell.font = { size: 16, bold: true };
            titleCell.alignment = { horizontal: 'center' };

            worksheet.mergeCells('A2', 'H2');
            const dateCell = worksheet.getCell('A2');
            dateCell.value = `Date Range: ${dateRangeStr}`;
            dateCell.font = { size: 12, italic: true };
            dateCell.alignment = { horizontal: 'center' };

            worksheet.addRow([]); // Spacing row

            // Totals row (spanning 8 columns)
            worksheet.addRow(['Total Orders:', totalOrders, 'Total Revenue:', `Rs. ${totalSales}`, 'Total Discount:', `Rs. ${totalDiscount}`, 'Total Refunded:', `Rs. ${totalRefunded}`]);
            worksheet.getRow(4).font = { bold: true };
            worksheet.addRow([]); // Spacing row

            // Headers
            const headerRow = worksheet.addRow(['Order ID', 'Date', 'Customer', 'Amount', 'Discount', 'Refunded', 'Method', 'Status']);
            headerRow.font = { bold: true };
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE2E8F0' }
                };
            });

            worksheet.columns = [
                { key: 'orderId', width: 22 },
                { key: 'date', width: 15 },
                { key: 'customer', width: 25 },
                { key: 'amount', width: 15 },
                { key: 'discount', width: 15 },
                { key: 'refunded', width: 15 },
                { key: 'method', width: 15 },
                { key: 'status', width: 15 }
            ];

            orders.forEach(order => {
                worksheet.addRow({
                    orderId: order.orderId,
                    date: new Date(order.createdAt).toLocaleDateString(),
                    customer: order.userId?.fullName || 'Guest',
                    amount: order.totalAmount,
                    discount: order.discount,
                    refunded: order.calculatedTotalRefund,
                    method: order.payment.method,
                    status: order.orderStatus
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

            await workbook.xlsx.write(res);
            res.end();

        } else if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 30, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
            doc.pipe(res);

            // Brand Header
            doc.rect(0, 0, doc.page.width, 100).fill('#f43f5e'); // Brand color background
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26).text('PawPalace', 30, 30);
            doc.fontSize(16).text('Sales Report', 30, 60);

            // Date Range & Info
            doc.fillColor('#ffffff').fontSize(12).text(`Date Range: ${dateRangeStr}`, doc.page.width - 250, 45, { align: 'right', width: 220 });
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, doc.page.width - 250, 65, { align: 'right', width: 220 });

            doc.fillColor('#000000'); // Reset color
            doc.moveDown(3);

            // Summary Boxes
            const summaryTop = 130;
            doc.rect(30, summaryTop, 120, 60).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.rect(160, summaryTop, 120, 60).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.rect(290, summaryTop, 120, 60).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.rect(420, summaryTop, 120, 60).fillAndStroke('#f8fafc', '#e2e8f0');

            doc.fillColor('#64748b').fontSize(10).font('Helvetica');
            doc.text('Total Orders', 40, summaryTop + 15);
            doc.text('Total Revenue', 170, summaryTop + 15);
            doc.text('Total Discount', 300, summaryTop + 15);
            doc.text('Total Refunds', 430, summaryTop + 15);

            doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold');
            doc.text(totalOrders.toString(), 40, summaryTop + 35);
            doc.text(`Rs. ${totalSales.toFixed(2)}`, 170, summaryTop + 35);
            doc.text(`Rs. ${totalDiscount.toFixed(2)}`, 300, summaryTop + 35);
            doc.text(`Rs. ${totalRefunded.toFixed(2)}`, 430, summaryTop + 35);

            // Table Settings
            doc.moveDown(3);
            const tableTop = 220;
            const columns = [
                { header: 'Order ID', x: 30, width: 120 },
                { header: 'Date', x: 150, width: 55 },
                { header: 'Customer', x: 205, width: 75 },
                { header: 'Method', x: 280, width: 50 },
                { header: 'Discount', x: 330, width: 55 },
                { header: 'Refund', x: 385, width: 55 },
                { header: 'Amount', x: 440, width: 60 },
                { header: 'Status', x: 500, width: 65 }
            ];

            // Table Header Background
            doc.rect(30, tableTop, doc.page.width - 60, 25).fill('#e2e8f0');

            // Table Header Text
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9);
            let y = tableTop + 8;
            columns.forEach(col => {
                doc.text(col.header, col.x, y, { width: col.width });
            });

            // Table Rows
            doc.font('Helvetica').fontSize(8);
            y = tableTop + 35;

            orders.forEach((order, index) => {
                // Add new page if close to bottom
                if (y > doc.page.height - 50) {
                    doc.addPage();
                    y = 30;
                }

                // Striped background
                if (index % 2 === 0) {
                    doc.rect(30, y - 5, doc.page.width - 60, 20).fill('#f8fafc');
                    doc.fillColor('#0f172a');
                }

                // Row Text
                doc.text(order.orderId.substring(0, 16) + (order.orderId.length > 16 ? '...' : ''), columns[0].x, y, { width: columns[0].width });
                doc.text(new Date(order.createdAt).toLocaleDateString(), columns[1].x, y, { width: columns[1].width });
                doc.text((order.userId?.fullName || 'Guest').substring(0, 15), columns[2].x, y, { width: columns[2].width });
                doc.text(order.payment?.method || 'N/A', columns[3].x, y, { width: columns[3].width });

                const discountStr = order.discount > 0 ? `Rs. ${order.discount}` : '-';
                doc.text(discountStr, columns[4].x, y, { width: columns[4].width });

                const refundStr = order.calculatedTotalRefund > 0 ? `Rs. ${order.calculatedTotalRefund}` : '-';
                doc.text(refundStr, columns[5].x, y, { width: columns[5].width });

                doc.text(`Rs. ${order.totalAmount}`, columns[6].x, y, { width: columns[6].width });

                doc.text(order.orderStatus, columns[7].x, y, { width: columns[7].width });

                y += 20;
            });

            doc.end();
        }

    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).send("Error generating report");
    }
};

export default {
    getSalesReport,
    downloadReport
};
