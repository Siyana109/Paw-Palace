import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },

  variant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Variant",
    required: true
  }
}, { timestamps: true });

// Prevent duplicate wishlist items
wishlistSchema.index({ user: 1, variant: 1 }, { unique: true });

export default mongoose.model("Wishlist", wishlistSchema);
