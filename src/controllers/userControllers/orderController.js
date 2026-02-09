import Order from "../../model/orderModel.js";

const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user?.id;
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

const requestItemReturn = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const { orderId, itemId } = req.params;
        const { reason } = req.body;

        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (!reason) return res.status(400).json({ success: false, message: 'Return reason is required' });

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.orderStatus !== 'Delivered' && order.orderStatus !== 'Partially Returned') {
            return res.status(400).json({ success: false, message: 'Order is not eligible for return' });
        }

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

        if (item.itemStatus !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Item is not eligible for return' });
        }

        if (item.returnRequest?.isRequested) {
            return res.status(400).json({ success: false, message: 'Return already requested for this item' });
        }

        // Update item return status
        item.returnRequest = {
            isRequested: true,
            reason: reason,
            status: 'Pending',
            requestedAt: new Date()
        };
        item.itemStatus = 'Return Requested';

        // Check if all items are returned/cancelled to potentially update main order status
        // For now, we just update the specific item. The admin will approve/reject.

        await order.save();

        res.json({ success: true, message: 'Return request submitted successfully' });

    } catch (error) {
        console.error("Request Item Return Error:", error);
        res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
};

export default { getOrderHistory, getOrderDetails, requestItemReturn }