import Order from "../../model/orderModel.js";
import Cart from "../../model/cartModel.js";
import Wallet from "../../model/walletModel.js";
import Variant from "../../model/variantModel.js";
import walletController from "../userControllers/walletController.js";
import PDFDocument from 'pdfkit';


const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        console.log(req.session.user.id)
        if (!userId) return res.redirect('/login');

        const page = parseInt(req.query.page) || 1;
        const status = req.query.status || 'All';
        const search = req.query.search || '';
        const limit = 10;
        const skip = (page - 1) * limit;

        let query = { userId };

        if (status !== 'All') {
            if (status === 'In Progress') {
                query.orderStatus = { $nin: ['Delivered', 'Cancelled', 'Returned', 'Failed'] };
            } else if (status === 'Failed') {
                query.$or = [
                    { orderStatus: 'Failed' },
                    { 'payment.status': 'Failed' }
                ];
            } else {
                query.orderStatus = status;
            }
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i')

            const searchQuery = {
                $or: [
                    { orderId: searchRegex },
                    { 'items.productName': searchRegex }
                ]
            };

            if (query.$or) {
                query = { $and: [query, searchQuery] };
            } else {
                Object.assign(query, searchQuery);
            }
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate("items.productId")
            .populate("items.variantId")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.render('user/orderHistory', {
            title: 'Order History | PawPalace',
            orders,
            currentPage: page,
            totalPages,
            currentStatus: status,
            searchQuery: search,
            user: req.session.user
        });

    } catch (error) {
        console.error("Get Order History Error:", error);
        res.status(500).render('error', { message: 'Failed to load orders' });
    }
};


const getOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const orderId = req.params.id;

        if (!userId) return res.redirect('/login');

        const order = await Order.findOne({ _id: orderId, userId })
            .populate("items.productId")
            .populate("items.variantId")
            .lean();

        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        res.render('user/singleOrder', {
            title: `Order #${order.orderId} | PawPalace`,
            order,
            user: req.session.user
        });

    } catch (error) {
        console.error("Get Order Details Error:", error);
        res.status(500).render('error', { message: 'Failed to load order details' });
    }
};


const requestReturnItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason, quantity } = req.body;
        const userId = req.session.user.id;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        let item = order.items.id(itemId);
        if (!item || item.itemStatus !== "Delivered") {
            return res.status(400).json({ success: false, message: "Invalid return request" });
        }

        const returnQty = quantity ? parseInt(quantity, 10) : item.quantity;
        if (returnQty <= 0 || returnQty > item.quantity) {
            return res.status(400).json({ success: false, message: "Invalid return quantity" });
        }

        // If partial return, split the item
        if (returnQty < item.quantity) {
            const originalQty = item.quantity;
            const remainingQty = originalQty - returnQty;
            const perItemPrice = item.price;

            // Reduce original item to the non-returned amount
            item.quantity = remainingQty;
            item.totalAmount = remainingQty * perItemPrice;
            if (item.couponDiscount) {
                item.couponDiscount = (item.couponDiscount / originalQty) * remainingQty;
            }
            if (item.shippingShare) {
                item.shippingShare = (item.shippingShare / originalQty) * remainingQty;
            }

            // Create a brand new item for the returned portion
            let returnedItemObj = item.toObject();
            delete returnedItemObj._id;      // Let mongoose generate a new ID
            delete returnedItemObj.createdAt;
            delete returnedItemObj.updatedAt;

            returnedItemObj.quantity = returnQty;
            returnedItemObj.totalAmount = returnQty * perItemPrice;
            if (returnedItemObj.couponDiscount) {
                returnedItemObj.couponDiscount = (item.couponDiscount / remainingQty) * returnQty;
            }
            if (returnedItemObj.shippingShare) {
                returnedItemObj.shippingShare = (item.shippingShare / remainingQty) * returnQty;
            }

            // Push the new cloned item, and set THAT item to the requested return one
            order.items.push(returnedItemObj);

            // Re-fetch the item we just pushed so it has an _id and model methods
            item = order.items[order.items.length - 1];
        }

        item.itemStatus = "Return Requested";
        item.returnRequest = {
            isRequested: true,
            reason,
            status: "Pending",
            requestedAt: new Date()
        };

        await order.save();

        res.json({ success: true });

    } catch (error) {
        console.error("Return Request Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


const cancelReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.session.user.id;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const item = order.items.id(itemId);
        console.log(itemId)
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        if (item.itemStatus !== 'Return Requested') {
            return res.status(400).json({ success: false, message: 'No return request found to cancel' });
        }

        // Revert status
        item.itemStatus = 'Delivered';
        item.returnRequest = {
            isRequested: false,
            reason: null,
            status: null,
            requestedAt: null
        };

        await order.save();
        res.json({ success: true, message: 'Return request cancelled successfully' });

    } catch (error) {
        console.error("Cancel Return Request Error:", error);
        res.status(500).json({ success: false, message: 'Failed to cancel return request' });
    }
};



const cancelOrderOrItem = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { itemId, reason } = req.body;
        const userId = req.session.user.id;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        console.log("orderId:", orderId);
        console.log("userId:", userId);

        // Decide which items to cancel
        const itemsToCancel = itemId
            ? [order.items.id(itemId)]
            : order.items.filter(
                i => !["Cancelled", "Returned"].includes(i.itemStatus)
            );

        if (!itemsToCancel.length) {
            return res.json({ success: false, message: "No cancellable items" });
        }

        for (const item of itemsToCancel) {
            if (!item) continue;

            // Safety: prevent double cancel/refund
            if (["Cancelled", "Returned"].includes(item.itemStatus)) continue;

            item.itemStatus = "Cancelled";
            item.cancelRequest = {
                isRequested: true,
                reason,
                status: "Approved",
                processedAt: new Date()
            };

            let refundAmount = 0;
            let itemDiscountShare = 0;
            let itemEffectiveValue = item.totalAmount;

            // Calculate remaining active items (excluding the one just marked cancelled)
            const remainingActiveItems = order.items.filter(
                i => !["Cancelled", "Returned"].includes(i.itemStatus)
            );

            if (remainingActiveItems.length === 0) {
                // LAST ACTIVE ITEM: Absorb all remaining amounts to zero out the order cleanly
                itemEffectiveValue = Math.max(0, order.totalAmount - order.shipping);
                itemDiscountShare = order.discount;
            } else {
                // Calculate Item Effective Value proportionally
                if (order.couponId) {
                    const orderDiscount = Number(order.discount) || 0;

                    if (item.couponDiscount && item.couponDiscount > 0) {
                        itemDiscountShare = item.couponDiscount;
                        itemEffectiveValue = item.totalAmount - item.couponDiscount;
                    } else if (orderDiscount > 0) {
                        // Calculate subtotal of historically original active items to get correct proportion
                        let originalSubtotal = 0;
                        if (order.items && order.items.length > 0) {
                            originalSubtotal = order.items.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
                        }

                        if (originalSubtotal > 0) {
                            const itemProportion = item.totalAmount / originalSubtotal;
                            const rawShare = orderDiscount * itemProportion;
                            itemEffectiveValue = Math.max(0, Math.round(item.totalAmount - rawShare));
                            itemDiscountShare = item.totalAmount - itemEffectiveValue;
                        }
                    }
                }
            }

            if (order.payment.method !== "COD" && order.payment.status === "Paid") {
                if (item.refund?.status === "Completed") continue;

                refundAmount = itemEffectiveValue;

                await walletController.creditWallet({
                    userId,
                    amount: refundAmount,
                    description: "Item Cancelled Refund",
                    orderId: order._id
                });

                item.refund = {
                    amount: refundAmount,
                    method: "Wallet",
                    status: "Completed",
                    refundedAt: new Date()
                };
            }

            // 📉 Adjust order totals
            // Regardless of payment method, the order's valid total decreases
            order.subtotal -= item.totalAmount;
            order.discount -= itemDiscountShare;
            order.totalAmount -= itemEffectiveValue; // Deduct effective value (price - discount)

            // 📦 Restore Stock
            if (item.variantId) {
                await Variant.findByIdAndUpdate(item.variantId, { $inc: { stock: item.quantity } });
            }
        }

        // 🔁 Update order status
        const remaining = order.items.filter(
            i => !["Cancelled", "Returned"].includes(i.itemStatus)
        );

        order.orderStatus =
            remaining.length === 0 ? "Cancelled" : "Partially Cancelled";

        // 🚚🚚 Shipping Refund Logic 🚚🚚
        // Refund shipping if the ENTIRE order is now cancelled and it's prepaid
        if (remaining.length === 0 && order.shipping > 0 && order.payment.method !== "COD") {
            const shippingRefund = order.shipping;

            await walletController.creditWallet({
                userId,
                amount: shippingRefund,
                description: "Shipping Fee Refund for Full Cancellation",
                orderId: order._id
            });

            // Adjust order totalAmount
            order.totalAmount -= shippingRefund;

            // Set shipping to 0 so we don't refund it again
            order.shipping = 0;
        }

        await order.save();

        res.json({ success: true });

    } catch (error) {
        console.error("Cancel Error:", error);
        res.json({ success: false, message: "Server error" });
    }
};


const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user?.id;

        const order = await Order.findOne({ _id: orderId, userId })
            .populate("items.productId")
            .populate("items.variantId")
            .lean();

        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        const doc = new PDFDocument({ margin: 50 });

        const filename = `invoice-${order.orderId}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // --- Header ---
        doc.fontSize(20).text('INVOICE', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text('Paw Palace', { align: 'right' });
        doc.text('123 Pet Street', { align: 'right' });
        doc.text('City, State, ZIP', { align: 'right' });
        doc.moveDown();

        // --- Order & Customer Info ---
        doc.text(`Order ID: ${order.orderId}`, 50, doc.y);
        doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString()}`);
        doc.text(`Status: ${order.orderStatus}`);
        doc.text(`Payment Method: ${order.payment.method} (${order.payment.status})`);
        if (order.payment.transactionId) {
            doc.text(`Transaction ID: ${order.payment.transactionId}`);
        }
        doc.moveDown();

        doc.text(`Bill To:`, 50, doc.y);
        doc.font('Helvetica-Bold').text(order.address.fullName);
        doc.font('Helvetica').text(order.address.addressLine);
        doc.text(`${order.address.city}, ${order.address.state} - ${order.address.zipCode}`);
        doc.text(order.address.country);
        doc.text(`Phone: ${order.address.phone}`);
        doc.moveDown();

        // --- Divider ---
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // --- Items Table Header ---
        const tableTop = doc.y + 10;
        const itemX = 50;
        const qtyX = 300;
        const priceX = 370;
        const totalX = 450;

        doc.font('Helvetica-Bold');
        doc.text('Item', itemX, tableTop);
        doc.text('Qty', qtyX, tableTop);
        doc.text('Price', priceX, tableTop);
        doc.text('Total', totalX, tableTop);
        doc.moveDown(); // Helps set next y correctly

        // Draw line below header
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.font('Helvetica');

        let y = doc.y + 10;
        let totalRefunded = 0;

        // --- Items ---
        order.items.forEach(item => {
            // Show all items EXCEPT Returned/Cancelled ones
            if (item.itemStatus !== 'Cancelled' && item.itemStatus !== 'Returned') {
                let productName = item.productName + (item.variantName ? ` - ${item.variantName}` : '');

                doc.text(productName, itemX, y, { width: 240, continued: false });
                doc.text(item.quantity.toString(), qtyX, y);

                // Pricing Logic
                const currentMRP = item.variantId ? item.variantId.price : item.price;
                const sellingPrice = item.price;
                const couponDisc = item.couponDiscount || 0;

                let priceY = y;

                if (currentMRP > sellingPrice) {
                    doc.fontSize(9).text(`MRP: Rs.${currentMRP}`, priceX, priceY, { strike: true });
                    priceY += 10;
                    doc.fontSize(10).fillColor('green').text(`Offer: Rs.${sellingPrice}`, priceX, priceY);
                    doc.fillColor('black');
                } else {
                    doc.text(`Rs.${sellingPrice.toFixed(2)}`, priceX, priceY);
                }

                if (couponDisc > 0) {
                    priceY += 12;
                    doc.fontSize(8).fillColor('blue').text(`Cpn Disc: -Rs.${couponDisc}`, priceX, priceY);
                    doc.fontSize(10).fillColor('black');
                }

                // Show total for the item (even if returned, it was part of the original invoice)
                doc.text(`Rs.${(item.price * item.quantity).toFixed(2)}`, totalX, y);

                y = Math.max(y + 20, priceY + 20);
            }
        });

        doc.moveDown();
        doc.moveTo(50, y).lineTo(550, y).stroke();
        y += 10;

        // --- Summary ---
        // Aligning to the right
        const summaryX = 350;
        const valueX = 450;

        doc.text('Subtotal:', summaryX, y);
        doc.text(`Rs.${(order.subtotal || 0).toFixed(2)}`, valueX, y);
        y += 15;

        doc.text('Discount:', summaryX, y);
        doc.text(`- Rs.${(order.discount || 0).toFixed(2)}`, valueX, y);
        y += 15;

        doc.text('Shipping:', summaryX, y);
        doc.text(`Rs.${(order.shipping || 50).toFixed(2)}`, valueX, y);
        y += 15;

        // Store current Y for lines
        let lineY = y + 5;
        doc.moveTo(summaryX, lineY).lineTo(550, lineY).stroke();
        y += 10;

        doc.font('Helvetica-Bold');
        doc.text('Total Amount:', summaryX, y);
        doc.text(`Rs.${order.totalAmount.toFixed(2)}`, valueX, y);
        y += 20;

        // If there are refunds, show them
        if (totalRefunded > 0 || (order.refundSummary && order.refundSummary.totalRefunded > 0)) {
            const finalRefund = (order.refundSummary && order.refundSummary.totalRefunded > 0)
                ? order.refundSummary.totalRefunded
                : totalRefunded;

            doc.fillColor('red');
            doc.text('Refunded:', summaryX, y);
            doc.text(`- Rs.${finalRefund.toFixed(2)}`, valueX, y);
            doc.fillColor('black');
            y += 15;

            // Updated Total or Net Payable (if desired, or just show original + refund)
            // Keeping it simple: Original Total - Refund = Net Paid
            const netPaid = order.totalAmount - finalRefund;
            doc.text('Net Amount Paid:', summaryX, y);
            doc.text(`Rs.${Math.max(0, netPaid).toFixed(2)}`, valueX, y);
            y += 20;
        }

        doc.font('Helvetica');

        // --- Footer ---
        doc.fontSize(10).text('Thank you for shopping with Paw Palace!', 50, 700, { align: 'center', width: 500 });
        if (totalRefunded > 0) {
            doc.fontSize(8).text('Note: This invoice includes returned items.', 50, 715, { align: 'center', width: 500 });
        }

        doc.end();

    } catch (error) {
        console.error("Download Invoice Error:", error);
        res.status(500).render('error', { message: 'Failed to generate invoice' });
    }
};



export default {
    getOrderHistory,
    getOrderDetails,
    requestReturnItem,
    cancelReturnRequest,
    cancelOrderOrItem,
    downloadInvoice,

};