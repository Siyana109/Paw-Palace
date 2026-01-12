import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
      },

      variant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Variant",
        required: true
      },

      quantity: {
        type: Number,
        required: true,
        min: 1
      },

      addedAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, { timestamps: true });

export default mongoose.model("Cart", cartSchema);
