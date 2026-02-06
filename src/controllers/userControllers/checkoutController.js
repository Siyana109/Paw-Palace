import Address from "../../model/addressModel.js";
import Cart from "../../model/cartModel.js";
import Coupon from "../../model/couponModel.js";
import Offer from "../../model/offerModel.js";
import Order from "../../model/orderModel.js";

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

        const orderId = req.params.id;

        const order = await Order.findById(orderId)
            .populate("items.productId")
            .populate("items.variantId");

        if (!order) {
            return res.redirect('/home'); // Or 404 page
        }

        // Check if order belongs to user
        if (order.userId.toString() !== userId) {
            return res.redirect('/home');
        }

        // Schema has subtotal
        const subtotal = order.subtotal;
        const shipping = 50;

        res.render('user/orderSuccess', {
            order: order,
            subtotal: subtotal,
            shipping: shipping,
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
           REMOVED RESTRICTION: The user requested to allow using the coupon multiple times 
           as long as the global usageLimit is not reached. 
           Previously, valid usage was blocked by a strict check here.
        */
        // const userUsed = coupon.usedBy.some(u => u.userId.toString() === userId);
        // if (userUsed) {
        //     return res.status(400).json({ success: false, message: "You have already used this coupon" });
        // }

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


const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { addressId, paymentDetails, couponCode } = req.body;

        console.log("REQ BODY:", req.body);

        /* 1️⃣ Validate payment method */
        const allowedMethods = ["COD", "ONLINE", "WALLET"];

        if (!allowedMethods.includes(paymentDetails)) {
            console.error("Invalid Payment Method:", paymentDetails);
            return res.redirect("/checkout");
        }

        /* ❌ FIX: Map 'ONLINE' to 'RAZORPAY' if needed by Schema, or 'COD' to 'COD' */
        // Schema Enum: ["COD", "RAZORPAY", "WALLET"]
        let paymentMethodCheck = paymentDetails;
        if (paymentDetails === "ONLINE") {
            paymentMethodCheck = "RAZORPAY";
        }

        const paymentMethod = paymentMethodCheck;

        /* 2️⃣ Fetch Cart */
        const cart = await Cart.findOne({ user: userId })
            .populate("items.product")
            .populate("items.variant");

        if (!cart || cart.items.length === 0) {
            return res.redirect("/cart");
        }

        /* 3️⃣ Fetch Address */
        const addressDoc = await Address.findOne({ _id: addressId, userId });
        if (!addressDoc) {
            return res.redirect("/checkout");
        }

        /* 4️⃣ Fetch active offers */
        const activeOffers = await Offer.find({
            status: "active",
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        });

        let subtotal = 0;
        const orderItems = [];

        cart.items.forEach(item => {
            const { offerApplied, finalPrice } = applyOfferToPrice({
                price: item.variant.price,
                productId: item.product._id,
                categoryId: item.product.categoryId,
                activeOffers
            });

            const price = offerApplied ? finalPrice : item.variant.price;
            const totalItemAmount = price * item.quantity;
            subtotal += totalItemAmount;

            orderItems.push({
                productId: item.product._id,
                variantId: item.variant._id,
                productName: item.product.productName,
                variantName: item.variant.size || item.variant.color || "",
                price,
                quantity: item.quantity,
                totalAmount: totalItemAmount
            });
        });

        /* 5️⃣ Apply Coupon (calculation only) */
        let discount = 0;
        let couponId = null;

        if (couponCode) {
            console.log("Checking Coupon:", couponCode);
            const coupon = await Coupon.findOne({ code: couponCode, isActive: true });

            if (coupon) {
                console.log("Coupon Found:", coupon.code);
                if (coupon.discountType === "percentage") {
                    discount = (subtotal * coupon.discountValue) / 100;
                    if (coupon.maximumDiscount) {
                        discount = Math.min(discount, coupon.maximumDiscount);
                    }
                } else {
                    discount = coupon.discountValue;
                }

                discount = Math.min(discount, subtotal);
                couponId = coupon._id;
                console.log("Discount Applied:", discount);
            } else {
                console.log("Coupon Not Found or Inactive");
            }
        } else {
            console.log("No Coupon Code provided in body");
        }

        const shipping = 50;
        const finalTotal = subtotal + shipping - discount;

        /* 6️⃣ Create Order */
        const order = await Order.create({
            userId,
            orderId: "ORD-" + Date.now(),
            items: orderItems,
            subtotal,
            discount,
            couponId,
            totalAmount: finalTotal,
            payment: {
                method: paymentMethod,
                status: paymentMethod === "COD" ? "Pending" : "Pending"
            },
            address: {
                fullName: addressDoc.fullName,
                phone: String(addressDoc.phone),
                addressLine: addressDoc.address,
                city: addressDoc.city,
                state: addressDoc.state,
                zipCode: String(addressDoc.zipCode),
                country: "India",
                landmark: addressDoc.landMark || "",
                addressType: addressDoc.addressType
            },
            orderStatus: "Pending"
        });

        /* 7️⃣ Update coupon usage ONLY AFTER order success */
        if (couponId) {
            await Coupon.updateOne(
                { _id: couponId },
                {
                    $inc: { usageCount: 1 },
                    $push: { usedBy: { userId, usedAt: new Date() } }
                }
            );
        }

        /* 8️⃣ Clear cart */
        await Cart.deleteOne({ user: userId });

        /* 9️⃣ Redirect */
        res.redirect(`/order-confirmation/${order._id}`);

    } catch (error) {
        console.error("❌ Place Order Error:", error);
        console.error("Stack:", error.stack);
        // If validation error, log details
        if (error.name === 'ValidationError') {
            console.error("Validation Details:", JSON.stringify(error.errors, null, 2));
        }
        res.redirect("/checkout");
    }
};

export default {
    getCheckoutPage,
    getOrderConfirmationPage,
    applyCoupon,
    placeOrder
};


