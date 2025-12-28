import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    fullName:{
        type: String,
        required: true
    },
    email:{
        type: String,
        required: true,
        unique: true
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    password:{
        type: String,
        required: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    profileImage: {
        type: String,
    },
    phone: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    modifiedAt: {
        type: Date,
        default: Date.now
    },
    isAdmin: {
        type: Boolean,
        deafult: false
    },
}, {timestamps: true})

export default mongoose.model('User', userSchema)
