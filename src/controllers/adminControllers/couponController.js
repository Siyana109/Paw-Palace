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
            description,
            discountType,
            discountValue,
            minimumPurchase,
            maximumDiscount,
            expiryDate,
            usageLimit,
            isActive
        } = req.body;

        // Prevent duplicate coupon
        const exists = await Coupon.findOne({ code: code.toUpperCase() });
        if (exists) {
            return res.redirect("/admin/coupons");
        }

        await Coupon.create({
            code,
            description,
            discountType,
            discountValue,
            minimumPurchase,
            maximumDiscount,
            expiryDate,
            usageLimit,
            isActive: isActive === "true"
        });

        res.redirect("/admin/coupons");

    } catch (error) {
        console.error("Add coupon error:", error);
        res.redirect("/admin/coupons");
    }
};


const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            code,
            description,
            discountType,
            discountValue,
            minimumPurchase,
            maximumDiscount,
            expiryDate,
            usageLimit,
            isActive
        } = req.body;

        await Coupon.findByIdAndUpdate(id, {
            code,
            description,
            discountType,
            discountValue,
            minimumPurchase,
            maximumDiscount,
            expiryDate,
            usageLimit,
            isActive: isActive === "true"
        });

        res.redirect("/admin/coupons");

    } catch (error) {
        console.error("Edit coupon error:", error);
        res.redirect("/admin/coupons");
    }
};


const deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.redirect("/admin/coupons");

    } catch (error) {
        console.error("Delete coupon error:", error);
        res.redirect("/admin/coupons");
    }
};


export default {loadCoupons, addCoupon, editCoupon, deleteCoupon}