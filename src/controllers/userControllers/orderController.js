import Order from "../../model/orderModel.js";
import Variant from "../../model/variantModel.js";
import Review from "../../model/reviewModel.js";
import walletController from "../userControllers/walletController.js";
import PDFDocument from 'pdfkit';


const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user?.id;

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
            const searchRegex = new RegExp(search.trim(), 'i')

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
            user: req.currentUser
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

        // Fetch user's reviews for this order
        const reviews = await Review.find({ orderId, userId }).lean();
        
        // Attach review info to items
        order.items = order.items.map(item => {
            const review = reviews.find(r => r.variantId.toString() === item.variantId._id.toString());
            return {
                ...item,
                userReview: review || null
            };
        });

        res.render('user/singleOrder', {
            title: `Order #${order.orderId} | PawPalace`,
            order,
            user: req.currentUser
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

        // 10-day return policy check
        const deliveryDate = order.deliveredAt ? new Date(order.deliveredAt) : null;
        if (!deliveryDate) {
            return res.status(400).json({ success: false, message: "Delivery date not found, cannot process return" });
        }

        const currentDate = new Date();
        const daysSinceDelivery = (currentDate - deliveryDate) / (1000 * 60 * 60 * 24);
        if (daysSinceDelivery > 10) {
            return res.status(400).json({ success: false, message: "Return policy period of 10 days has expired" });
        }

        // If partial return, split the item
        if (returnQty < item.quantity) {
            const originalQty = item.quantity;
            const remainingQty = originalQty - returnQty;
            const perItemPrice = item.price;

            // Reduce original item to the non-returned amount
            item.quantity = remainingQty;
            item.totalAmount = Math.round((remainingQty * perItemPrice) * 100) / 100;

            const originalCouponDiscount = item.couponDiscount || 0;
            const originalShippingShare = item.shippingShare || 0;

            if (originalCouponDiscount > 0) {
                const remainingCouponDisc = Math.round((originalCouponDiscount / originalQty) * remainingQty * 100) / 100;
                item.couponDiscount = remainingCouponDisc;
            }
            if (originalShippingShare > 0) {
                const remainingShippingShare = Math.round((originalShippingShare / originalQty) * remainingQty * 100) / 100;
                item.shippingShare = remainingShippingShare;
            }

            // Create a brand new item for the returned portion
            let returnedItemObj = { ...item.toObject() };
            delete returnedItemObj._id;      // Let mongoose generate a new ID
            delete returnedItemObj.createdAt;
            delete returnedItemObj.updatedAt;

            returnedItemObj.quantity = returnQty;
            returnedItemObj.totalAmount = Math.round((returnQty * perItemPrice) * 100) / 100;
            
            if (originalCouponDiscount > 0) {
                returnedItemObj.couponDiscount = Math.round((originalCouponDiscount - item.couponDiscount) * 100) / 100;
            }
            if (originalShippingShare > 0) {
                returnedItemObj.shippingShare = Math.round((originalShippingShare - item.shippingShare) * 100) / 100;
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
        const { itemId, reason, quantity } = req.body;
        const userId = req.session.user.id;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        // Decide which items to cancel
        const itemsToCancel = itemId
            ? order.items.filter(i => i._id.toString() === itemId)
            : order.items.filter(i => !["Cancelled", "Returned"].includes(i.itemStatus));

        if (!itemsToCancel.length) {
            return res.json({ success: false, message: "No cancellable items" });
        }

        for (let item of itemsToCancel) {
            if (!item) continue;

            // Safety: prevent double cancel/refund
            if (["Cancelled", "Returned"].includes(item.itemStatus)) continue;

            const cancelQty = quantity ? parseInt(quantity, 10) : item.quantity;

            if (cancelQty <= 0 || cancelQty > item.quantity) {
                return res.json({ success: false, message: "Invalid cancel quantity" });
            }

            // PARTIAL CANCEL
            if (cancelQty < item.quantity) {

                const originalQty = item.quantity;
                const remainingQty = originalQty - cancelQty;
                const perItemPrice = item.price;

                // reduce original item
                item.quantity = remainingQty;
                item.totalAmount = Math.round((remainingQty * perItemPrice) * 100) / 100;

                const origCouponDiscount = item.couponDiscount || 0;
                const origShippingShare = item.shippingShare || 0;

                if (origCouponDiscount > 0) {
                    item.couponDiscount = Math.round((origCouponDiscount / originalQty) * remainingQty * 100) / 100;
                }
                if (origShippingShare > 0) {
                    item.shippingShare = Math.round((origShippingShare / originalQty) * remainingQty * 100) / 100;
                }


                // create cancelled item
                const originalItemData = item.toObject();

                const cancelledItem = {
                    ...originalItemData,
                    quantity: cancelQty,
                    totalAmount: Math.round((cancelQty * perItemPrice) * 100) / 100,
                    couponDiscount: Math.round((origCouponDiscount - (item.couponDiscount || 0)) * 100) / 100,
                    shippingShare: Math.round((origShippingShare - (item.shippingShare || 0)) * 100) / 100,

                    itemStatus: "Cancelled",
                    cancelRequest: {
                        isRequested: true,
                        reason,
                        status: "Approved",
                        processedAt: new Date()
                    }
                };

                delete cancelledItem._id;

                order.items.push(cancelledItem);

                // use the new cancelled item
                item = order.items[order.items.length - 1];

            } else {

                item.itemStatus = "Cancelled";
                item.cancelRequest = {
                    isRequested: true,
                    reason,
                    status: "Approved",
                    processedAt: new Date()
                };

            }

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


            const cancelledAmount = cancelQty * item.price;

            // Adjust order totals
            // Regardless of payment method, the order's valid total decreases
            order.subtotal = Math.max(0, order.subtotal - cancelledAmount);
            order.discount = Math.max(0, order.discount - itemDiscountShare);
            order.totalAmount = Math.max(0, order.totalAmount - itemEffectiveValue); // Deduct effective value (price - discount)

            // Restore Stock
            if (item.variantId) {
                await Variant.findByIdAndUpdate(item.variantId, { $inc: { stock: cancelQty } });
            }
        }

        // Update order status
        const remaining = order.items.filter(
            i => !["Cancelled", "Returned"].includes(i.itemStatus)
        );

        order.orderStatus =
            remaining.length === 0 ? "Cancelled" : "Partially Cancelled";

        // Shipping Refund Logic
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
        doc.text(`Rs.${(order.shipping || 0).toFixed(2)}`, valueX, y);
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