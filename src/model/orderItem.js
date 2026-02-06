import mongoose from "mongoose";

export const orderItemSchema = new mongoose.Schema({
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

  productName: {
    type: String,
    required: true
  },

  variantName: {
    type: String
  },

  price: {
    type: Number,
    required: true
  },

  quantity: {
    type: Number,
    required: true,
    min: 1
  },

  totalAmount: {
    type: Number,
    required: true
  },

  itemStatus: {
    type: String,
    enum: [
      "Ordered",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Returned"
    ],
    default: "Ordered"
  },

  cancelRequest: {
    isRequested: { type: Boolean, default: false },
    reason: String,
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: null
    },
    requestedAt: Date,
    processedAt: Date
  },

  returnRequest: {
    isRequested: { type: Boolean, default: false },
    reason: String,
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: null
    },
    requestedAt: Date,
    processedAt: Date
  },

  refund: {
    amount: { type: Number, default: 0 },
    method: String,
    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: null
    },
    refundedAt: Date
  }

}, { timestamps: true });


