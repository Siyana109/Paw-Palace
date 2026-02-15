import Order from "../../model/orderModel.js";
import Cart from "../../model/cartModel.js";
import Wallet from "../../model/walletModel.js";
import Variant from "../../model/variantModel.js";
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
            const searchRegex = new RegExp(search, 'i');
            // We need to look up orders where orderId matches OR any item matches
            // Note: items.productName is inside the items array.
            // But we are not joining tables here, basic find.
            // We populated productId? No, items array has productId ref.
            // Wait, the schema stores product details in items array?
            // Let's check orderItemSchema. Usually yes for snapshots.
            // Assuming items has productName.

            // If we already have $or (from 'Failed' status), we need to be careful.
            // $and: [ { original_query }, { $or: [ { orderId }, { 'items.productName' } ] } ]

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
        const { reason } = req.body;
        const userId = req.session.user.id;

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const item = order.items.id(itemId);
        if (!item || item.itemStatus !== "Delivered") {
            return res.status(400).json({ success: false, message: "Invalid return request" });
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


const reorder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user.id;

        const order = await Order.findOne({ _id: orderId, userId }).populate('items.variantId');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        let addedCount = 0;

        for (const item of order.items) {
            if (item.variantId && item.variantId.stock > 0) {
                const existingItemIndex = cart.items.findIndex(cartItem => cartItem.variant.toString() === item.variantId._id.toString());

                if (existingItemIndex > -1) {
                    let newQty = cart.items[existingItemIndex].quantity + item.quantity;
                    if (newQty > item.variantId.stock) newQty = item.variantId.stock;
                    cart.items[existingItemIndex].quantity = newQty;
                } else {
                    let qty = item.quantity;
                    if (qty > item.variantId.stock) qty = item.variantId.stock;
                    cart.items.push({
                        product: item.productId,
                        variant: item.variantId._id,
                        quantity: qty
                    });
                }
                addedCount++;
            }
        }

        if (addedCount === 0) {
            return res.status(400).json({ success: false, message: 'Items are out of stock' });
        }

        await cart.save();
        res.json({ success: true, redirect: '/checkout' });

    } catch (error) {
        console.error("Reorder Error:", error);
        res.status(500).json({ success: false, message: 'Failed to reorder' });
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

            // ⛔ Safety: prevent double cancel/refund
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

            // 🧮 Calculate Item Effective Value (considering coupons)
            if (order.couponId) {
                const orderDiscount = Number(order.discount) || 0;

                // Priority 1: Use pre-calculated discount from DB
                if (item.couponDiscount && item.couponDiscount > 0) {
                    itemDiscountShare = item.couponDiscount;
                    itemEffectiveValue = item.totalAmount - item.couponDiscount;
                }
                // Priority 2: Fallback to dynamic calculation
                else if (orderDiscount > 0) {
                    // Calculate subtotal of currently active items (including the one being cancelled)
                    const currentActiveSubtotal = order.items.reduce((sum, i) => {
                        // Include if active OR if it's the current item (which we just marked cancelled)
                        if (!["Cancelled", "Returned"].includes(i.itemStatus) || i._id.equals(item._id)) {
                            return sum + (i.totalAmount || 0);
                        }
                        return sum;
                    }, 0);

                    if (currentActiveSubtotal > 0) {
                        const itemProportion = item.totalAmount / currentActiveSubtotal;
                        const rawShare = orderDiscount * itemProportion;
                        itemEffectiveValue = Math.max(0, Math.round(item.totalAmount - rawShare));
                        itemDiscountShare = item.totalAmount - itemEffectiveValue;
                    }
                }
            }

            // 💰 Process Refund if applicable (Prepaid orders)
            // For COD, we don't refund to wallet unless it was somehow paid (future proofing), 
            // but usually COD cancel means no payment collected yet.
            if (order.payment.method !== "COD") {
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
            // Show all items including Returned/Cancelled ones, but mark them
            if (item.itemStatus !== 'Cancelled') {
                let productName = item.productName + (item.variantName ? ` - ${item.variantName}` : '');

                // Add status marker if returned
                if (item.itemStatus === 'Returned') {
                    productName += ' (Returned)';
                    // Calculate refund amount for this item (approximate if not stored)
                    const refundAmount = item.refund && item.refund.amount ? item.refund.amount : 0;
                    totalRefunded += refundAmount;
                }

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
        doc.text(`Rs.50.00`, valueX, y); // Hardcoded per UI
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
    reorder,
    cancelOrderOrItem,
    downloadInvoice,

};