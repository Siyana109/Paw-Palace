import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
    categoryName: {
        type: String,
        required: true,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    offer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Offer',
        default: null
        },
},{ timestamps: true })

export default mongoose.model('Category', categorySchema)

