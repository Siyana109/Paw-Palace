import Order from "../../model/orderModel.js";

// GET /admin/orders
const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { search, status, payment, sort } = req.query;

        let query = {};

        // Search (Order ID or User Name - requires lookup if searching by user name, 
        // but simple ID search is easier first. For user name, we might need aggregation or populate match)
        // For now, let's enable basic Order ID search.
        if (search) {
            query.orderId = { $regex: search, $options: 'i' };
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
        if (['Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'].includes(status)) {
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

export default {
    getAllOrders,
    getOrderDetails,
    updateOrderStatus
};
