import Review from "../../model/reviewModel.js";
import Product from "../../model/productModel.js";
import reviewHelper from "../../helpers/reviewHelper.js";

const getReviews = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const totalReviews = await Review.countDocuments();
        const totalPages = Math.ceil(totalReviews / limit);

        const reviews = await Review.find()
            .populate("userId", "fullName email")
            .populate("productId", "name")
            .populate("variantId", "variantName coverImage")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.render("admin/reviews", {
            reviews,
            currentPage: page,
            totalPages,
            currentPath: "/admin/reviews"
        });
    } catch (error) {
        console.error("Get Admin Reviews Error:", error);
        res.status(500).render("error/500", { message: "Failed to fetch reviews" });
    }
};

const updateReviewStatus = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { status, rejectionReason } = req.body; // Approved | Rejected

        if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: "Review not found" });
        }

        const oldStatus = review.status;
        review.status = status;
        if (status === "Rejected" && rejectionReason) {
            review.rejectionReason = rejectionReason;
        } else if (status === "Approved") {
            review.rejectionReason = ""; // Clear reason if approved
        }
        await review.save();

        // If status changed from Approved to Rejected, or vice versa, we need to update product stats
        if (oldStatus !== status) {
            const product = await Product.findById(review.productId);
            if (product) {
                const reviews = await Review.find({ productId: product._id, status: "Approved" });
                const count = reviews.length;
                const avg = count > 0 
                    ? reviews.reduce((acc, curr) => acc + curr.rating, 0) / count 
                    : 0;

                product.reviewCount = count;
                product.averageRating = Number(avg.toFixed(1));
                await product.save();
            }
        }

        res.json({ success: true, message: `Review ${status.toLowerCase()} successfully` });
    } catch (error) {
        console.error("Update Review Status Error:", error);
        res.status(500).json({ success: false, message: "Failed to update review status" });
    }
};

const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const result = await reviewHelper.deleteReviewInternal(reviewId);
        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error("Admin Delete Review Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete review" });
    }
};

export default {
    getReviews,
    updateReviewStatus,
    deleteReview
};
