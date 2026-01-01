import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
    },

    fullName: {
        type: String,
        required: true,
        minlength: 3,
        maxlength: 10
    },

    phone: {
        type: Number,
        required: true
    },

    address: {
        type: String,
        required: true
    },

    landMark: {
        type: String
    },

    city: {
        type: String,
        required: true
    },

    state: {
        type: String,
        required: true
    },

    zipCode: {
        type: Number,
        required: true
    }
}, { timestamps: true });


export default mongoose.model('Address', addressSchema);