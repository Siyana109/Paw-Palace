import Review from "../model/reviewModel.js";
import Product from "../model/productModel.js";

/**
 * Internal function to delete a review and update product stats.
 * Can be called from user actions or automated return processes.
 */
const deleteReviewInternal = async (reviewId) => {
    const review = await Review.findById(reviewId);
    if (!review) return { success: false, message: "Review not found" };

    const { rating, productId } = review;

    await Review.findByIdAndDelete(reviewId);

    // Update Product stats ONLY if the review was Approved
    if (review.status === "Approved") {
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
    }

    return { success: true, message: "Review deleted successfully" };
};

export default {
    deleteReviewInternal
};
