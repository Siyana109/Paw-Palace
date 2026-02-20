import Order from "../../model/orderModel.js";
import exceljs from "exceljs";
import PDFDocument from "pdfkit";

// Helper to get date range filters
const getDateRange = (filter) => {
    const today = new Date();
    let startDate, endDate;

    switch (filter) {
        case 'daily':
            startDate = new Date(today.setHours(0, 0, 0, 0));
            endDate = new Date(today.setHours(23, 59, 59, 999));
            break;
        case 'weekly':
            const firstDay = today.getDate() - today.getDay();
            startDate = new Date(today.setDate(firstDay));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'yearly':
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
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
            orderStatus: { $nin: ['Cancelled', 'Failed', 'Pending'] } // Exclude non-sales
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
                    productsSold: { $sum: { $size: "$items" } } // Approximate, better to unwind if exact qty needed
                }
            }
        ]);

        const stats = metrics[0] || { totalOrders: 0, totalRevenue: 0, totalDiscount: 0, productsSold: 0 };

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
        res.status(500).render('error', { message: "Failed to load sales report" });
    }
};

// --- Downloader Functions ---

const downloadReport = async (req, res) => {
    try {
        const { format, filter, startDate, endDate } = req.query;
        let dateQuery = {};

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

        const orders = await Order.find({
            ...dateQuery,
            orderStatus: { $nin: ['Cancelled', 'Failed', 'Pending'] }
        }).populate('userId', 'fullName').lean();

        if (format === 'excel') {
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');

            worksheet.columns = [
                { header: 'Order ID', key: 'orderId', width: 20 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Customer', key: 'customer', width: 25 },
                { header: 'Amount', key: 'amount', width: 15 },
                { header: 'Discount', key: 'discount', width: 15 },
                { header: 'Method', key: 'method', width: 15 },
                { header: 'Status', key: 'status', width: 15 }
            ];

            orders.forEach(order => {
                worksheet.addRow({
                    orderId: order.orderId,
                    date: new Date(order.createdAt).toLocaleDateString(),
                    customer: order.userId?.fullName || 'Guest',
                    amount: order.totalAmount,
                    discount: order.discount,
                    method: order.payment.method,
                    status: order.orderStatus
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

            await workbook.xlsx.write(res);
            res.end();

        } else if (format === 'pdf') {
            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

            doc.pipe(res);

            doc.fontSize(20).text('Sales Report', { align: 'center' });
            doc.moveDown();

            orders.forEach(order => {
                doc.fontSize(12).text(
                    `${order.orderId} | ${new Date(order.createdAt).toLocaleDateString()} | Rs.${order.totalAmount} | ${order.orderStatus}`
                );
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
