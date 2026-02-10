import Order from "../../model/orderModel.js";
import creditWallet from "../userControllers/walletController.js";


const getReturnRequests = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        // Find orders that have at least one item with status 'Return Requested'
        const query = { 'items.itemStatus': 'Return Requested' };

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate('userId', 'fullName email phone')
            .populate('items.productId', 'name')
            .populate('items.variantId', 'coverImage variantName price')
            .sort({ 'items.returnRequest.requestedAt': -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Process orders to extract only relevant items for the view if needed, 
        // OR just pass orders and let EJS filter items. Passing orders is easier.

        res.render('admin/returnRequests', {
            orders,
            currentPage: page,
            totalPages
        });

    } catch (error) {
        console.error("Get Return Requests Error:", error);
        res.status(500).render('error', { message: 'Failed to fetch return requests' });
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


const handleReturnAction = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { action } = req.body; // approve | reject

        const order = await Order.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        const item = order.items.id(itemId);
        if (!item || item.returnRequest.status !== "Pending") {
            return res.json({ success: false, message: "Invalid return action" });
        }

        // ❌ Reject return
        if (action === "reject") {
            item.returnRequest.status = "Rejected";
            item.returnRequest.processedAt = new Date();
            item.itemStatus = "Delivered";

            await order.save();
            return res.json({ success: true, message: "Return request rejected" });
        }

        // ✅ Approve return
        const refundAmount = item.totalAmount;

        // 1️⃣ Wallet credit
        await creditWallet({
            userId: order.userId,
            amount: refundAmount,
            description: "Item Return Refund",
            orderId: order._id
        });

        if (item.refund?.status === "Completed") {
            return res.json({ success: false, message: "Already refunded" });
        }

        // 2️⃣ Update item
        item.itemStatus = "Returned";
        item.returnRequest.status = "Approved";
        item.returnRequest.processedAt = new Date();

        item.refund = {
            amount: refundAmount,
            method: "Wallet",
            status: "Completed",
            refundedAt: new Date()
        };

        // 3️⃣ Update order totals
        order.subtotal -= refundAmount;
        order.totalAmount -= refundAmount;

        order.refundSummary.totalRefunded += refundAmount;
        order.refundSummary.refundedAt = new Date();

        // 4️⃣ Update order status
        const activeItems = order.items.filter(
            i => !["Cancelled", "Returned"].includes(i.itemStatus)
        );

        order.orderStatus =
            activeItems.length === 0 ? "Returned" : "Partially Returned";

        await order.save();

        res.json({ success: true, message: "Return approved & refunded" });

    } catch (error) {
        console.error("Return Action Error:", error);
        res.json({ success: false, message: "Server error" });
    }
};



export default { getReturnRequests, requestReturnItem, handleReturnAction }