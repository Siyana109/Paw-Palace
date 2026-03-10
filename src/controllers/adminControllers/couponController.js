import Coupon from "../../model/couponModel.js";

const loadCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });

        const totalRedemptions = coupons.reduce(
            (sum, c) => sum + c.usageCount,
            0
        );

        res.render("admin/coupons", {
            coupons,
            totalRedemptions
        });

    } catch (error) {
        console.error("Load coupons error:", error);
        res.redirect("/admin/dashboard");
    }
};




function validateCouponData(data) {
    const errors = [];

    const code = data.code?.trim().toUpperCase();
    const couponRegex = /^[A-Z0-9]{4,20}$/;
    const discountType = data.discountType;
    const discountValue = Number(data.discountValue);
    const minimumPurchase = Number(data.minimumPurchase) || 0;
    const maximumDiscount = Number(data.maximumDiscount) || null;
    const usageLimit = Number(data.usageLimit)

    if (!code) {
        errors.push("Coupon code is required.");
    }

    if (!couponRegex.test(code)) {
        errors.push(
            "Coupon code must be 4–20 characters and contain only uppercase letters and numbers."
        );
    }

    if (!discountValue || discountValue <= 0) {
        errors.push("Discount value must be positive.");
    }

    if (discountType === "percentage" && discountValue > 90) {
        errors.push("Percentage discount cannot exceed 90%.");
    }

    // Fixed discount rule
    if (discountType === "fixed") {

        const minPurchase = Number(minimumPurchase) || 0;
        const discount = Number(discountValue);

        if (minPurchase <= 0) {
            errors.push("Minimum purchase must be greater than 0 for fixed coupons.");
        }

        const maxDiscount = minPurchase * 0.9;

        if (discount > maxDiscount) {
            errors.push("Discount cannot exceed 90% of minimum purchase amount.");
        }
    }

    if (discountType === "percentage" && maximumDiscount !== null && maximumDiscount <= 0) {
        errors.push("Maximum discount must be positive.");
    }

    if (minimumPurchase < 0) {
        errors.push("Minimum purchase cannot be negative.");
    }

    if (usageLimit <= 0) {
        errors.push("Usage limit should be greater than 0");
    }

    if (!data.startDate) {
        errors.push("Start date is required.");
    }

    if (!data.expiryDate) {
        errors.push("Expiry date is required.");
    }

    if (data.startDate && data.expiryDate) {

        const start = new Date(data.startDate);
        const end = new Date(data.expiryDate);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (end < today) {
            errors.push("Expiry date cannot be in the past.");
        }

        if (start > end) {
            errors.push("Start date must be before expiry date.");
        }
    }

    return errors;
}



const addCoupon = async (req, res) => {
    try {

        const errors = validateCouponData(req.body);

        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: errors[0]
            });
        }

        const {
            code,
            discountType,
            discountValue,
            minimumPurchase,
            maximumDiscount,
            startDate,
            expiryDate,
            usageLimit,
            isActive
        } = req.body;

        const exists = await Coupon.findOne({ code: code.toUpperCase() });

        if (exists) {
            return res.status(400).json({
                success: false,
                message: "Coupon code already exists"
            });
        }

        await Coupon.create({
            code: code.toUpperCase(),
            discountType,
            discountValue: Number(discountValue),
            minimumPurchase: Number(minimumPurchase) || 0,
            maximumDiscount: maximumDiscount ? Number(maximumDiscount) : null,
            startDate: startDate || Date.now(),
            expiryDate,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            isActive: isActive === "true"
        });

        res.json({
            success: true,
            message: "Coupon created successfully"
        });

    } catch (error) {
        console.error("Add coupon error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


const editCoupon = async (req, res) => {
    try {

        const { id } = req.params;

        const errors = validateCouponData(req.body);

        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: errors[0]
            });
        }

        const {
            code,
            discountType,
            discountValue,
            minimumPurchase,
            maximumDiscount,
            startDate,
            expiryDate,
            usageLimit,
            isActive
        } = req.body;

        const exists = await Coupon.findOne({
            code: code.toUpperCase(),
            _id: { $ne: id }
        });

        if (exists) {
            return res.status(400).json({
                success: false,
                message: "Coupon code already exists"
            });
        }

        await Coupon.findByIdAndUpdate(id, {
            code: code.toUpperCase(),
            discountType,
            discountValue: Number(discountValue),
            minimumPurchase: Number(minimumPurchase) || 0,
            maximumDiscount: maximumDiscount ? Number(maximumDiscount) : null,
            startDate: startDate || Date.now(),
            expiryDate,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            isActive: isActive === "true"
        });

        res.json({
            success: true,
            message: "Coupon updated successfully"
        });

    } catch (error) {
        console.error("Edit coupon error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


const deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Coupon deleted successfully" });
    } catch (error) {
        console.error("Delete coupon error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};


export default { loadCoupons, addCoupon, editCoupon, deleteCoupon };