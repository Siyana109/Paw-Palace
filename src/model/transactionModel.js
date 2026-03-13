import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  type: {
    type: String,
    enum: ["Order", "Wallet", "Refund"],
    required: true
  },

  transactionId: {
    type: String,
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  method: {
    type: String,
    required: true
  },

  status: {
    type: String,
    required: true
  },

  description: String,

  date: {
    type: Date,
    default: Date.now
  }

});

transactionSchema.index({ date: -1 });

export default mongoose.model("Transaction", transactionSchema);