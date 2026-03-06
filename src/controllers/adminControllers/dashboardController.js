import Order from "../../model/orderModel.js";
import Product from "../../model/productModel.js";
import User from "../../model/userModel.js";

const getDashboard = async (req, res) => {
    try {
        // 1. Base query for valid/completed orders to calculate revenue
        const validOrderMatch = {
            orderStatus: { $nin: ['Cancelled', 'Failed', 'Pending', 'Returned'] },
            "payment.status": { $ne: "Failed" }
        };

        // 2. Aggregate Total Revenue and Total Orders (valid)
        const metrics = await Order.aggregate([
            { $match: validOrderMatch },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" },
                    totalOrders: { $sum: 1 }
                }
            }
        ]);

        const stats = metrics[0] || { totalRevenue: 0, totalOrders: 0 };

        // 3. Count products and users
        const totalProducts = await Product.countDocuments();
        const totalUsers = await User.countDocuments({ isAdmin: false });

        // 4. Fetch Recent 5 Orders
        const recentOrders = await Order.find()
            .populate('userId', 'fullName email')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // 5. Chart Data: Monthly Revenue (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const monthlySales = await Order.aggregate([
            {
                $match: {
                    ...validOrderMatch,
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" }
                    },
                    revenue: { $sum: "$totalAmount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Format chart data for frontend
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartLabels = [];
        const chartData = [];

        // Generate the last 6 months sequentially to ensure no gaps
        let currentMonth = new Date(sixMonthsAgo);
        for (let i = 0; i < 6; i++) {
            const m = currentMonth.getMonth() + 1; // 1-12
            const y = currentMonth.getFullYear();

            chartLabels.push(`${monthNames[m - 1]} ${y}`);

            const match = monthlySales.find(data => data._id.month === m && data._id.year === y);
            chartData.push(match ? match.revenue : 0);

            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        // 6. Top 10 Best Selling Products
        const topProducts = await Order.aggregate([
            { $match: validOrderMatch },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.productId",
                    totalSold: { $sum: "$items.quantity" }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            { $unwind: "$productInfo" },
            {
                $project: {
                    name: "$productInfo.productName",
                    totalSold: 1
                }
            }
        ]);

        // 7. Top 10 Best Selling Categories
        const topCategories = await Order.aggregate([
            { $match: validOrderMatch },
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.productId",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            { $unwind: "$productInfo" },
            {
                $group: {
                    _id: "$productInfo.categoryId",
                    totalSold: { $sum: "$items.quantity" }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "categoryInfo"
                }
            },
            { $unwind: "$categoryInfo" },
            {
                $project: {
                    name: "$categoryInfo.categoryName",
                    totalSold: 1
                }
            }
        ]);

        // 8. Top 10 Best Selling Brands
        const topBrands = await Order.aggregate([
            { $match: validOrderMatch },
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.productId",
                    foreignField: "_id",
                    as: "productInfo"
                }
            },
            { $unwind: "$productInfo" },
            {
                $group: {
                    _id: "$productInfo.brandId",
                    totalSold: { $sum: "$items.quantity" }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "brands",
                    localField: "_id",
                    foreignField: "_id",
                    as: "brandInfo"
                }
            },
            { $unwind: "$brandInfo" },
            {
                $project: {
                    name: "$brandInfo.brandName",
                    totalSold: 1
                }
            }
        ]);

        res.render('admin/dashboard', {
            title: 'Admin Dashboard | PawPalace',
            stats: {
                totalRevenue: stats.totalRevenue,
                totalOrders: stats.totalOrders,
                totalProducts,
                totalUsers
            },
            recentOrders,
            chartData: JSON.stringify({
                labels: chartLabels,
                data: chartData
            }),
            topProducts,
            topCategories,
            topBrands
        });

    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).send("Internal Server Error");
    }
};

export default { getDashboard };
