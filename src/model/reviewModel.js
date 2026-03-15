import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Variant",
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        trim: true,
        maxLength: 500
    },
    images: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Approved"
    }
}, { timestamps: true });

export default mongoose.model("Review", reviewSchema);
