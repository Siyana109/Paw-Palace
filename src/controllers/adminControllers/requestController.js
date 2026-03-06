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
        let refundAmount = 0;
        let itemDiscountShare = 0;

        // Calculate remaining active items BEFORE marking this one as returned explicitly in DB,
        // (but this item is considered effectively returned right now)
        const remainingActiveItems = order.items.filter(
            i => !["Cancelled", "Returned"].includes(i.itemStatus) && !i._id.equals(item._id)
        );

        if (remainingActiveItems.length === 0) {
            // LAST ACTIVE ITEM: Absorb all remaining amounts to zero out the order cleanly
            refundAmount = Math.max(0, order.totalAmount - order.shipping);
            itemDiscountShare = order.discount;
        } else {
            // Calculate Item Effective Value proportionally
            refundAmount = Number(item.totalAmount);

            if (order.couponId) {
                console.log("Coupon ID present:", order.couponId);
                const orderDiscount = Number(order.discount) || 0;

                // Priority 1: Use pre-calculated discount from DB
                if (item.couponDiscount && item.couponDiscount > 0) {
                    itemDiscountShare = item.couponDiscount;
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
                        const rawShare = orderDiscount * itemProportion;
                        refundAmount = Math.max(0, Math.round(item.totalAmount - rawShare));
                        itemDiscountShare = item.totalAmount - refundAmount;
                    }
                }
            }
        }

        // Shipping Refund Logic (Correct Proportional Method)

        // ORIGINAL SHIPPING CHARGED
        const originalShippingFee = Number(order.shipping || 0);

        // If no shipping charged → no refund
        let shippingRefund = 0;

        if (originalShippingFee > 0) {

            // Get items that were originally part of shipping distribution
            const originalItemsTotal = order.items.reduce(
                (sum, i) => sum + Number(i.totalAmount || 0),
                0
            );

            if (originalItemsTotal > 0) {

                // Proportional share
                shippingRefund = Math.round(
                    (Number(item.totalAmount) / originalItemsTotal) * originalShippingFee
                );

                // SAFETY: If this is the LAST active item,
                // refund ALL remaining shipping
                const remainingActiveItems = order.items.filter(
                    i => !["Cancelled", "Returned"].includes(i.itemStatus)
                );

                if (remainingActiveItems.length === 1) {
                    // Refund whatever shipping is left
                    shippingRefund = originalShippingFee;
                }
            }
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
        if (order.discount >= itemDiscountShare) {
            order.discount -= itemDiscountShare;
        } else {
            order.discount = 0;
        }
        order.totalAmount -= refundAmount;
        order.shipping -= shippingRefund;


        order.refundSummary.totalRefunded += refundAmount;
        order.refundSummary.refundedAt = new Date();

        // Restore Stock (Only if restock is true)
        if (req.body.restock !== false) {
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
        console.log("Original shipping calculated:", originalShippingFee);
        console.log("========================");


        await order.save();

        res.json({ success: true, message: "Return approved & refunded" });

    } catch (error) {
        console.error("Return Action Error:", error);
        res.json({ success: false, message: "Server error" });
    }
};


export default { getReturnRequests, handleReturnAction }