import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: true,
        trim: true
    },
    brandId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    description: {
        type: String,
        required: true,
        minLength: 10,
        maxLength: 250
    },
    petType: {
        type: [String],
        enum: ['Dogs', 'Cats', 'Puppies', 'Kittens'], // Added singular for backward compat just in case, but new inputs will use array
        required: true
    },
}, { timestamps: true });

export default mongoose.model("Product", productSchema);
