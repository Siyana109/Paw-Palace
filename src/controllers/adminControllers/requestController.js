import Order from "../../model/orderModel.js";
import Variant from "../../model/variantModel.js";
import walletController from "../userControllers/walletController.js";


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

        const deliveredAt = item.deliveredAt;
        const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days

        if (Date.now() - deliveredAt > returnWindow) {
            return res.json({ success: false, message: "Return window expired" });
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

        // Reject return
        if (action === "reject") {
            item.returnRequest.status = "Rejected";
            item.returnRequest.processedAt = new Date();
            item.itemStatus = "Delivered";

            await order.save();
            return res.json({ success: true, message: "Return request rejected" });
        }

        // Approve return
        let refundAmount = Number(item.totalAmount);

        // Deduct proportional coupon discount
        if (order.couponId) {
            console.log("Coupon ID present:", order.couponId);
            const orderDiscount = Number(order.discount) || 0;

            // Priority 1: Use pre-calculated discount from DB
            if (item.couponDiscount && item.couponDiscount > 0) {
                refundAmount = item.totalAmount - item.couponDiscount;
                console.log("Using stored couponDiscount:", item.couponDiscount);
            }
            // Priority 2: Fallback to dynamic calculation
            else if (orderDiscount > 0) {
                let originalSubtotal = 0;
                if (order.items && order.items.length > 0) {
                    originalSubtotal = order.items.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
                }

                if (originalSubtotal > 0) {
                    const itemProportion = item.totalAmount / originalSubtotal;
                    const itemDiscountShare = orderDiscount * itemProportion;
                    refundAmount = Math.max(0, Math.round(item.totalAmount - itemDiscountShare));
                }
            }
        }


        // Shipping Refund Logic (Correct Proportional Method)

        // Get original shipping stored in order
//  Reconstruct ORIGINAL shipping (stateless & accurate)

// Step 1: total of all items (this already contains offer-applied prices)
const originalItemsTotal = order.items.reduce(
    (sum, i) => sum + Number(i.totalAmount || 0),
    0
);

// Step 2: subtract coupon discount
const originalDiscount = Number(order.discount || 0);

// IMPORTANT: item.totalAmount already contains offer price.
// So DO NOT subtract offer discount again.

const originalNetAmount = originalItemsTotal - originalDiscount;

// Step 3: determine shipping
const originalShippingFee = originalNetAmount >= 500 ? 0 : 50;

let shippingRefund = 0;

if (originalShippingFee > 0 && originalItemsTotal > 0) {
    shippingRefund = Math.round(
        (Number(item.totalAmount) / originalItemsTotal) * originalShippingFee
    );
}

refundAmount += shippingRefund;


        // Wallet credit
        await walletController.creditWallet({
            userId: order.userId,
            amount: refundAmount,
            description: "Item Return Refund",
            orderId: order._id
        });

        if (item.refund?.status === "Completed") {
            return res.json({ success: false, message: "Already refunded" });
        }

        // Update item
        item.itemStatus = "Returned";
        item.returnRequest.status = "Approved";
        item.returnRequest.processedAt = new Date();

        item.refund = {
            amount: refundAmount,
            method: "Wallet",
            shippingRefund,
            status: "Completed",
            refundedAt: new Date()
        };

        // Update order totals
        order.subtotal -= item.totalAmount;
        order.totalAmount -= refundAmount;

        order.refundSummary.totalRefunded += refundAmount;
        order.refundSummary.refundedAt = new Date();

        // Restore Stock (Only if restock is true)
        if (req.body.restock !== false) { // Default to true if not specified
            await Variant.findByIdAndUpdate(
                item.variantId,
                { $inc: { stock: item.quantity } }
            );
        }

        // Update order status
        const activeItems = order.items.filter(
            i => !["Cancelled", "Returned"].includes(i.itemStatus)
        );

        if (activeItems.length === 0) {
            order.orderStatus = "Returned";
        }

        console.log("==== SHIPPING DEBUG ====");
console.log("Item total:", item.totalAmount);
console.log("All items total:", originalItemsTotal);
console.log("Order discount:", originalDiscount);
console.log("Original net:", originalNetAmount);
console.log("Original shipping calculated:", originalShippingFee);
console.log("========================");


        await order.save();

        res.json({ success: true, message: "Return approved & refunded" });

    } catch (error) {
        console.error("Return Action Error:", error);
        res.json({ success: false, message: "Server error" });
    }
};


export default { getReturnRequests, requestReturnItem, handleReturnAction }