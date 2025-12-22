import mongoose from "mongoose";

const admiSchema = mongoose.Schema({
    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true
    }
},{timestamps: true}
)

module.exports = mongoose.model('admin', adminSchema)