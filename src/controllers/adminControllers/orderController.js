import Order from "../../model/orderModel.js";
import User from "../../model/userModel.js";

// GET /admin/orders
const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { search, status, payment, sort } = req.query;

        let query = {};

        // Search Logic
        if (search) {
            // Find users matching the search term
            const users = await User.find({
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');
            const userIds = users.map(u => u._id);

            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },          // Search by Order ID
                { userId: { $in: userIds } },                            // Search by User
                { 'items.productName': { $regex: search, $options: 'i' } } // Search by Product Name
            ];
        }

        if (status) query.orderStatus = status;
        if (payment) {
            if (payment === 'Online') {
                query["payment.method"] = { $in: ['RAZORPAY', 'WALLET'] };
            } else if (payment === 'Wallet') {
                query["payment.method"] = 'WALLET';
            } else {
                query["payment.method"] = payment;
            }
        }

        let sortQuery = { createdAt: -1 };
        if (sort === 'amount_high') sortQuery = { totalAmount: -1 };
        if (sort === 'amount_low') sortQuery = { totalAmount: 1 };
        if (sort === 'oldest') sortQuery = { createdAt: 1 };
        if (sort === 'newest') sortQuery = { createdAt: -1 };


        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate('userId', 'fullName email') // Get user details
            .sort(sortQuery)
            .skip(skip)
            .limit(limit)
            .lean();

        // Calculate Stats
        const stats = {
            total: await Order.countDocuments(),
            completed: await Order.countDocuments({ orderStatus: 'Delivered' }),
            pending: await Order.countDocuments({ orderStatus: { $in: ['Pending', 'Processing', 'Placed'] } }),
            cancelled: await Order.countDocuments({ orderStatus: 'Cancelled' })
        };

        res.render('admin/orders', {
            orders,
            currentPage: page,
            totalPages,
            stats,
            query: req.query
        });

    } catch (error) {
        console.error("Admin Get Orders Error:", error);
        res.status(500).render('error', { message: 'Failed to fetch orders' });
    }
};

// GET /admin/orders/:id (JSON for Drawer)
const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('userId', 'fullName email phone')
            .populate('items.productId', 'name')
            .populate('items.variantId', 'coverImage variantName')
            .lean();

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({ success: true, order });
    } catch (error) {
        console.error("Admin Get Order Details Error:", error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// PUT /admin/orders/:id/status
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const orderId = req.params.id;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Logic check: Can't change from Cancelled/Delivered usually
        if (['Returned', 'Cancelled'].includes(order.orderStatus)) {
            return res.status(400).json({ success: false, message: `Cannot change status of ${order.orderStatus} order` });
        }

        order.orderStatus = status;

        // If delivered, update payment status if COD
        // If delivered, set dates
        if (status === 'Delivered') {
            order.deliveredAt = new Date();
            if (order.payment.method === 'COD') {
                order.payment.status = 'Paid';
                order.payment.paidAt = new Date();
            }
        }

        // Sync item statuses with order status
        if (['Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned'].includes(status)) {
            order.items.forEach(item => {
                if (!['Cancelled', 'Returned'].includes(item.itemStatus)) {
                    item.itemStatus = status;
                }
            });
        }

        await order.save();

        res.json({ success: true, message: 'Order status updated successfully' });

    } catch (error) {
        console.error("Update Status Error:", error);
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
};

// GET /admin/returns - Get all return requests
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

// POST /admin/orders/:orderId/items/:itemId/return-action
const handleReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { action } = req.body; // 'approve' or 'reject'

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        if (item.itemStatus !== 'Return Requested') {
            return res.status(400).json({ success: false, message: 'Item is not waiting for return approval' });
        }

        if (action === 'approve') {
            item.itemStatus = 'Returned';
            item.returnRequest.status = 'Approved';
            item.returnRequest.resolvedAt = new Date();

            // TODO: Implement Refund Logic (Wallet/Gateway) here
            // item.price * item.quantity refund...

            // Check if all items are now returned/cancelled -> Update Order Status
            const allItemsProcessed = order.items.every(i => ['Returned', 'Cancelled'].includes(i.itemStatus));
            if (allItemsProcessed) {
                order.orderStatus = 'Returned';
            } else {
                order.orderStatus = 'Partially Returned';
            }

        } else if (action === 'reject') {
            item.itemStatus = 'Delivered'; // Revert to delivered
            item.returnRequest.status = 'Rejected';
            item.returnRequest.resolvedAt = new Date();
            // Optional: item.returnRequest.adminComment = req.body.comment;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        await order.save();
        res.json({ success: true, message: `Return request ${action}d successfully` });

    } catch (error) {
        console.error("Handle Return Request Error:", error);
        res.status(500).json({ success: false, message: 'Failed to process return request' });
    }
};

export default {
    getAllOrders,
    getOrderDetails,
    updateOrderStatus,
    getReturnRequests,
    handleReturnRequest
};
