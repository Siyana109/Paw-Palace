import Review from "../../model/reviewModel.js";
import Product from "../../model/productModel.js";
import Order from "../../model/orderModel.js";

const addReview = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to submit a review" });
        }

        const { productId, variantId, orderId, rating, comment } = req.body;

        if (!productId || !variantId || !orderId || !rating) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Verify purchase and delivered status
        const order = await Order.findOne({
            _id: orderId,
            userId,
            orderStatus: "Delivered",
            "items.variantId": variantId
        });

        if (!order) {
            return res.status(403).json({ success: false, message: "You can only review items that have been delivered" });
        }

        // Check if user already reviewed this variant in this order
        const existingReview = await Review.findOne({ userId, variantId, orderId });
        if (existingReview) {
            return res.status(400).json({ success: false, message: "You have already reviewed this item for this order" });
        }

        const review = new Review({
            productId,
            variantId,
            userId,
            orderId,
            rating: Number(rating),
            comment,
            status: "Approved" // Default to approved for now
        });

        await review.save();

        // Update Product average rating and review count
        const product = await Product.findById(productId);
        if (product) {
            const oldCount = product.reviewCount || 0;
            const oldAvg = product.averageRating || 0;
            
            const newCount = oldCount + 1;
            // Correct calculation for new average
            const newAvg = ((oldAvg * oldCount) + Number(rating)) / newCount;

            product.reviewCount = newCount;
            product.averageRating = Number(newAvg.toFixed(1));
            await product.save();
        }

        res.status(201).json({ success: true, message: "Review added successfully!" });

    } catch (error) {
        console.error("Add Review Error (Details):", {
            userId,
            productId,
            variantId,
            orderId,
            rating,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: error.message || "Failed to add review" });
    }
};

const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const totalReviews = await Review.countDocuments({ productId, status: "Approved" });
        const totalPages = Math.ceil(totalReviews / limit);

        const reviews = await Review.find({ productId, status: "Approved" })
            .populate("userId", "_id fullName")
            .populate("variantId", "size color")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.status(200).json({ 
            success: true, 
            reviews,
            pagination: {
                totalReviews,
                totalPages,
                currentPage: page,
                hasNextPage: page < totalPages
            }
        });
    } catch (error) {
        console.error("Get Reviews Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch reviews" });
    }
};

const deleteReview = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const { reviewId } = req.params;

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: "Review not found" });
        }

        // Check if owner or admin (assuming req.session.isAdmin exists)
        if (review.userId.toString() !== userId && !req.session.isAdmin) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const rating = review.rating;
        const productId = review.productId;

        await Review.findByIdAndDelete(reviewId);

        // Update Product stats
        const product = await Product.findById(productId);
        if (product && product.reviewCount > 0) {
            const oldCount = product.reviewCount;
            const oldAvg = product.averageRating;

            if (oldCount === 1) {
                product.reviewCount = 0;
                product.averageRating = 0;
            } else {
                const newCount = oldCount - 1;
                const newAvg = ((oldAvg * oldCount) - rating) / newCount;
                product.reviewCount = newCount;
                product.averageRating = Number(newAvg.toFixed(1));
            }
            await product.save();
        }

        res.status(200).json({ success: true, message: "Review deleted" });
    } catch (error) {
        console.error("Delete Review Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete review" });
    }
};

export default {
    addReview,
    getProductReviews,
    deleteReview
};
