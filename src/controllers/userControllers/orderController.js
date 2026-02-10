import Order from "../../model/orderModel.js";
import Cart from "../../model/cartModel.js";
import Wallet from "../../model/walletModel.js";
import creditWallet from "../userControllers/walletController.js";


const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        if (!userId) return res.redirect('/login');

        const page = parseInt(req.query.page) || 1;
        const status = req.query.status || 'All';
        const limit = 10;
        const skip = (page - 1) * limit;

        let query = { userId };

        if (status !== 'All') {
            if (status === 'In Progress') {
                query.orderStatus = { $nin: ['Delivered', 'Cancelled', 'Returned', 'Failed'] };
            } else if (status === 'Failed') {
                // Check for either Order Failed OR Payment Failed
                query.$or = [
                    { orderStatus: 'Failed' },
                    { 'payment.status': 'Failed' }
                ];
            } else {
                // Delivered, Cancelled, Returned
                query.orderStatus = status;
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
            user: req.session.user
        });

    } catch (error) {
        console.error("Get Order History Error:", error);
        res.status(500).render('error', { message: 'Failed to load orders' });
    }
};


const getOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user?._id;
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
        const userId = req.session.user._id;

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
        const userId = req.session.user._id;

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
        const userId = req.session.user._id;

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
        const userId = req.session.user._id;

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

            // 💰 Refund only if already paid (ONLINE / WALLET)
            if (order.payment.method !== "COD") {

                if (item.refund?.status === "Completed") continue;

                await creditWallet({
                    userId,
                    amount: item.totalAmount,
                    description: "Item Cancelled Refund",
                    orderId: order._id
                });

                item.refund = {
                    amount: item.totalAmount,
                    method: "Wallet",
                    status: "Completed",
                    refundedAt: new Date()
                };
            }

            // 📉 Adjust order totals
            order.subtotal -= item.totalAmount;
            order.totalAmount -= item.totalAmount;
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


export default {
    getOrderHistory,
    getOrderDetails,
    requestReturnItem,
    cancelReturnRequest,
    reorder,
    cancelOrderOrItem
};