import mongoose from "mongoose";

const variantSchema = new mongoose.Schema ({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    size: {
        type: String
    },
    color: {
        type: String
    },
    stock: {
        type: Number,
        default: 0
    },
    coverImage: {
        type: String,
        required: true,
    },
    subImages: {
        type: [String]
    },
    offer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Offer'
    },
    offerPrice: {
        type: Number,
        min: 0
    },
    offerApplied: {
        type: Boolean,
        default: false
    },
    offerType: {
        type: String,
        enum: ['product', 'category', 'none'],
        default: 'none'
    }
},
    { timestamps: true });

export default mongoose.model("Variant", variantSchema);