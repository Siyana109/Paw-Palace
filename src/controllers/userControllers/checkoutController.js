import Address from "../../model/addressModel.js";
import Cart from "../../model/cartModel.js";
import Coupon from "../../model/couponModel.js";
import Offer from "../../model/offerModel.js"

import { applyOfferToPrice } from "../../../utils/applyOffer.js";

const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user.id;

        const addresses = await Address.find({ userId }).sort({ isDefault: -1 });

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: "items.product",
                populate: { path: "categoryId" }
            })
            .populate("items.variant");

        const coupons = await Coupon.find({
            isActive: true,
            expiryDate: { $gte: new Date() }
        });

        if (!cart || cart.items.length === 0) {
            return res.redirect("/cart");
        }

        const hasOutOfStock = cart.items.some(
            item => item.variant.stock === 0
        );

        if (hasOutOfStock) {
            return res.redirect('/cart');
        }

        // 🔥 Fetch active offers ONCE
        const activeOffers = await Offer.find({
            status: "active",
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        });

        // 🔥 Recalculate offers for each cart item
        cart.items.forEach(item => {
            const { offerApplied, finalPrice } = applyOfferToPrice({
                price: item.variant.price,
                productId: item.product._id,
                categoryId: item.product.categoryId._id,
                activeOffers
            });

            item.variant.offerApplied = offerApplied;
            if (offerApplied) {
                item.variant.offerPrice = finalPrice;
            }
        });

        res.render("user/checkout", {
            addresses,
            cart,
            coupons
        });

    } catch (error) {
        console.error("Checkout page error:", error);
        res.status(500).send("Server Error in checkout controller");
    }
};

const getOrderConfirmationPage = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) {
            return res.redirect('/login');
        }

        /* 
          MOCK ORDER DATA 
          Since we don't have orderModel yet, and this is frontend-focused.
        */
        const mockOrder = {
            _id: "ORD-" + Math.floor(100000 + Math.random() * 900000),
            createdAt: new Date(),
            paymentMethod: "Cash on Delivery",
            totalAmount: 585.60, // Matching the checkout mockup total roughly
            address: {
                fullName: "Sarah Jenkins",
                addressType: "OFFICE",
                address: "456 Corporate Blvd, Suite 200",
                city: "Tech City",
                state: "CA",
                zipCode: "90211",
                phone: "9037642209"
            },
            items: [
                {
                    productName: "Cozy Cloud Donut Bed",
                    quantity: 1,
                    price: 45.00,
                    image: "/path/to/bed.jpg", // Placeholder
                    variantDetails: "Medium / Pink"
                },
                {
                    productName: "Plush Squeaky Bone",
                    quantity: 2,
                    price: 25.00,
                    image: "/path/to/bone.jpg", // Placeholder
                    variantDetails: "Classic"
                }
            ],
            subtotal: 95.00,
            shipping: 50.00,
            tax: 15.60,
            discount: 0
        };

        // If we had real logic, we'd fetch by req.params.id here

        res.render('user/orderConfirm', {
            order: mockOrder,
            user: req.session.user
        });

    } catch (error) {
        console.error("Order Confirmation Error:", error);
        res.redirect('/home');
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user.id;

        if (!couponCode) {
            return res.status(400).json({ success: false, message: "Coupon code is required" });
        }

        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Invalid or inactive coupon" });
        }

        // Validate Date
        if (new Date() > new Date(coupon.expiryDate)) {
            return res.status(400).json({ success: false, message: "Coupon has expired" });
        }

        // Validate Usage Limit (Global)
        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
        }

        // Validate Per User Usage
        /* 
           Assuming 'usedBy' tracks usage. 
           (Adjust logic if you want to allow multiple uses per user, but usually 1 per user for strict coupons. 
           The model has an array 'usedBy', we check if userId exists in it)
        */
        const userUsed = coupon.usedBy.some(u => u.userId.toString() === userId);
        if (userUsed) {
            // Optional: Allow re-use? User didn't specify. Defaulting to standard strict "one use per user" or maybe check logic later.
            // For now, let's assume one-time use per coupon per user unless specified otherwise.
            return res.status(400).json({ success: false, message: "You have already used this coupon" });
        }

        // --- Calculate Cart Total (Securely) ---
        const cart = await Cart.findOne({ user: userId })
            .populate({ path: "items.product", populate: { path: "categoryId" } })
            .populate("items.variant");

        if (!cart || !cart.items.length) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        // Re-Apply Offers logic to get correct subtotal
        const activeOffers = await Offer.find({
            status: "active",
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        });

        let subtotal = 0;

        cart.items.forEach(item => {
            const { offerApplied, finalPrice } = applyOfferToPrice({
                price: item.variant.price,
                productId: item.product._id,
                categoryId: item.product.categoryId._id,
                activeOffers
            });

            const price = offerApplied ? finalPrice : item.variant.price;
            subtotal += price * item.quantity;
        });

        // Validate Minimum Purchase
        if (subtotal < coupon.minimumPurchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minimumPurchase} required`
            });
        }

        // Calculate Discount
        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = (subtotal * coupon.discountValue) / 100;
            if (coupon.maximumDiscount && discountAmount > coupon.maximumDiscount) {
                discountAmount = coupon.maximumDiscount;
            }
        } else {
            discountAmount = coupon.discountValue;
        }

        // Ensure discount doesn't exceed subtotal
        discountAmount = Math.min(discountAmount, subtotal);

        const finalTotal = subtotal - discountAmount;
        // Note: Shipping is added on frontend or final order creation. 
        // We return the discount amount and let frontend do final math or we confirm final total structure.
        // Frontend adds +50 shipping.

        res.json({
            success: true,
            message: "Coupon applied successfully",
            discount: discountAmount,
            couponCode: coupon.code,
            subtotal: subtotal // useful for sync
        });

    } catch (error) {
        console.error("Apply Coupon Error:", error);
        res.status(500).json({ success: false, message: "Server error applying coupon" });
    }
};

export default {
    getCheckoutPage,
    getOrderConfirmationPage,
    applyCoupon
};


