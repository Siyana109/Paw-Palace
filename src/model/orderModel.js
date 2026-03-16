import mongoose from "mongoose";
import { orderItemSchema } from "./orderItem.js";

const orderSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    orderId: {
        type: String,
        required: true,
        unique: true
    },

    orderDate: {
        type: Date,
        default: Date.now
    },

    items: [orderItemSchema],

    subtotal: {
        type: Number,
        required: true
    },

    discount: {
        type: Number,
        default: 0
    },

    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        default: null
    },

    shipping: {
        type: Number,
        default: 0
    },

    totalAmount: {
        type: Number,
        required: true
    },

    payment: {
        method: {
            type: String,
            enum: ["COD", "RAZORPAY", "WALLET"],
            required: true
        },
        status: {
            type: String,
            enum: ["Pending", "Paid", "Failed", "Refunded"],
            default: "Pending"
        },
        transactionId: String,
        paidAt: Date
    },

    address: {
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        addressLine: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, default: "India" },
        landmark: String,
        addressType: String
    },

    orderStatus: {
        type: String,
        enum: [
            "Pending",
            "Processing",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Partially Cancelled",
            "Cancelled",
            "Partially Returned",
            "Returned",
            "Failed"
        ],
        default: "Pending"
    },

    shippedAt: Date,
    deliveredAt: Date,

    refundSummary: {
        totalRefunded: { type: Number, default: 0 },
        refundedAt: Date
    }

}, { timestamps: true });

export default mongoose.model("Order", orderSchema);