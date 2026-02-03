import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true
  },

  addressType: {
    type: String,
    enum: ["Home", "Work", "Other"],
    default: "Home"
  },

  fullName: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 30
  },

  phone: {
    type: String, // ✅ string is better than number
    required: true
  },

  address: {
    type: String,
    required: true
  },

  landMark: String,

  city: {
    type: String,
    required: true
  },

  state: {
    type: String,
    required: true
  },

  zipCode: {
    type: String, // ✅ keep as string
    required: true
  }

}, { timestamps: true });

export default mongoose.model("Address", addressSchema);