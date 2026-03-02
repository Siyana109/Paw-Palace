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

const addCoupon = async (req, res) => {
    try {
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

        // Validation
        if (!code || code.trim().length < 4) {
            return res.status(400).json({ success: false, message: "Code must be at least 4 characters" });
        }

        if (!discountValue || Number(discountValue) <= 0) {
            return res.status(400).json({ success: false, message: "Discount value must be positive" });
        }

        if (discountType === 'percentage' && Number(discountValue) > 90) {
            return res.status(400).json({ success: false, message: "Percentage cannot exceed 90%" });
        }

        if (discountType === 'fixed' && minimumPurchase && Number(discountValue) >= Number(minimumPurchase)) {
            return res.status(400).json({ success: false, message: "Discount amount must be less than the minimum purchase amount" });
        }

        if (discountType === 'percentage' && maximumDiscount && Number(maximumDiscount) <= 0) {
            return res.status(400).json({ success: false, message: "Maximum discount must be positive" });
        }

        if (!expiryDate || new Date(expiryDate) < new Date()) {
            return res.status(400).json({ success: false, message: "End date must be in the future" });
        }

        if (startDate && expiryDate && new Date(startDate) > new Date(expiryDate)) {
            return res.status(400).json({ success: false, message: "Start date cannot be after end date" });
        }

        // Check Duplicate
        const exists = await Coupon.findOne({ code: code.toUpperCase() });
        if (exists) {
            return res.status(400).json({ success: false, message: "Coupon code already exists" });
        }

        await Coupon.create({
            code: code.toUpperCase(),
            discountType,
            discountValue: Number(discountValue),
            minimumPurchase: Number(minimumPurchase) || 0,
            maximumDiscount: Number(maximumDiscount) || null,
            startDate: startDate || Date.now(),
            expiryDate,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            isActive: isActive === "true"
        });

        res.json({ success: true, message: "Coupon created successfully" });

    } catch (error) {
        console.error("Add coupon error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};


const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
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

        // Validation
        if (!code || code.trim().length < 4) {
            return res.status(400).json({ success: false, message: "Code must be at least 4 characters" });
        }

        if (!discountValue || Number(discountValue) <= 0) {
            return res.status(400).json({ success: false, message: "Discount value must be positive" });
        }

        if (discountType === 'percentage' && Number(discountValue) > 90) {
            return res.status(400).json({ success: false, message: "Percentage cannot exceed 90%" });
        }

        if (discountType === 'fixed' && minimumPurchase && Number(discountValue) >= Number(minimumPurchase)) {
            return res.status(400).json({ success: false, message: "Discount amount must be less than the minimum purchase amount" });
        }

        if (discountType === 'percentage' && maximumDiscount && Number(maximumDiscount) <= 0) {
            return res.status(400).json({ success: false, message: "Maximum discount must be positive" });
        }

        // Date Check (allow today/future)
        const exp = new Date(expiryDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (exp < today) {
            return res.status(400).json({ success: false, message: "End date cannot be in the past" });
        }

        if (startDate && expiryDate && new Date(startDate) > new Date(expiryDate)) {
            return res.status(400).json({ success: false, message: "Start date cannot be after end date" });
        }

        // Check if code exists for OTHER coupon
        const exists = await Coupon.findOne({ code: code.toUpperCase(), _id: { $ne: id } });
        if (exists) {
            return res.status(400).json({ success: false, message: "Coupon code already exists" });
        }

        await Coupon.findByIdAndUpdate(id, {
            code: code.toUpperCase(),
            discountType,
            discountValue: Number(discountValue),
            minimumPurchase: Number(minimumPurchase) || 0,
            maximumDiscount: Number(maximumDiscount) || null,
            startDate: startDate || Date.now(),
            expiryDate,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            isActive: isActive === "true"
        });

        res.json({ success: true, message: "Coupon updated successfully" });

    } catch (error) {
        console.error("Edit coupon error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
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