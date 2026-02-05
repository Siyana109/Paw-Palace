import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },

    discountType: {
        type: String,
        enum: ["fixed", "percentage"],
        required: true
    },

    discountValue: {
        type: Number,
        required: true,
        min: 0
    },

    minimumPurchase: {
        type: Number,
        default: 0
    },

    maximumDiscount: {
        type: Number,
        default: null
    },

    startDate: {
        type: Date,
        default: Date.now
    },

    expiryDate: {
        type: Date,
        required: true
    },

    isActive: {
        type: Boolean,
        default: true
    },

    usageCount: {
        type: Number,
        default: 0
    },

    usageLimit: {
        type: Number,
        default: null // null = unlimited
    },

    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users"
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order"
        },
        usedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, { timestamps: true });

export default mongoose.model("Coupon", couponSchema);
