import Address from "../../model/addressModel.js";
import Cart from "../../model/cartModel.js";
import Coupon from "../../model/couponModel.js";
import Offer from "../../model/offerModel.js";
import Order from "../../model/orderModel.js";
import Variant from "../../model/variantModel.js";
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

        let stockIssues = [];

        cart.items.forEach(item => {
            if (!item.variant || !item.variant.isActive || item.variant.stock === 0) {
                stockIssues.push({
                    type: "OOS",
                    productId: item.product._id,
                    variantId: item.variant?._id,
                    message: "Out of stock or unavailable"
                });
            } else if (item.quantity > item.variant.stock) {
                stockIssues.push({
                    type: "LIMIT_EXCEEDED",
                    productId: item.product._id,
                    variantId: item.variant._id,
                    available: item.variant.stock,
                    message: `Only ${item.variant.stock} left`
                });
            }
        });

        res.render("user/checkout", {
            addresses,
            cart,
            coupons,
            stockIssues
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

        /* 1️ Validate payment method */
        const allowedMethods = ["COD", "ONLINE", "WALLET"];

        if (!allowedMethods.includes(paymentDetails)) {
            console.error("Invalid Payment Method:", paymentDetails);
            return res.redirect("/checkout");
        }

        //  FIX: Map 'ONLINE' to 'RAZORPAY' if needed by Schema, or 'COD' to 'COD' 
        // Schema Enum: ["COD", "RAZORPAY", "WALLET"]
        let paymentMethodCheck = paymentDetails;
        if (paymentDetails === "ONLINE") {
            paymentMethodCheck = "RAZORPAY";
        }

        const paymentMethod = paymentMethodCheck;

        /* 2️ Fetch Cart */
        const cart = await Cart.findOne({ user: userId })
            .populate("items.product")
            .populate("items.variant");

        if (!cart || cart.items.length === 0) {
            return res.redirect("/cart");
        }

        /* 3️ Fetch Address */
        const addressDoc = await Address.findOne({ _id: addressId, userId });
        if (!addressDoc) {
            return res.redirect("/checkout");
        }

        /* 4️ Fetch active offers */
        const activeOffers = await Offer.find({
            status: "active",
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        });

        let subtotal = 0;
        let offerDiscount = 0;
        const orderItems = [];

        cart.items.forEach(item => {
            const { offerApplied, finalPrice } = applyOfferToPrice({
                price: item.variant.price,
                productId: item.product._id,
                categoryId: item.product.categoryId,
                activeOffers
            });

            const price = offerApplied ? finalPrice : item.variant.price;
            const originalAmount = item.variant.price * item.quantity;
            const discountedAmount = (offerApplied ? finalPrice : item.variant.price) * item.quantity;
            const totalItemAmount = price * item.quantity;

            subtotal += originalAmount;
            offerDiscount += (originalAmount - discountedAmount);

            orderItems.push({
                productId: item.product._id,
                variantId: item.variant._id,
                productName: item.product.productName,
                variantName: item.variant.size || item.variant.color || "",
                price,
                quantity: item.quantity,
                totalAmount: totalItemAmount,
                couponDiscount: 0 // Will be updated if coupon applied
            });
        });

        //  Apply Coupon (calculation only) 
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

                // 🌟 Distribute discount to items for refund accuracy
                const postOfferSubtotal = subtotal - offerDiscount;

                if (discount > 0 && postOfferSubtotal > 0) {

                    let distributedDiscount = 0;

                    orderItems.forEach((item, index) => {

                        const proportion = item.totalAmount / postOfferSubtotal;

                        let itemDiscount = Math.round(discount * proportion);

                        if (index === orderItems.length - 1) {
                            itemDiscount = discount - distributedDiscount;
                        }

                        item.couponDiscount = itemDiscount;

                        distributedDiscount += itemDiscount;
                    });
                }
                else {
                    console.log("Coupon Not Found or Inactive");
                }
            } else {
                console.log("No Coupon Code provided in body");
            }
        }
        const postDiscountAmount = subtotal - offerDiscount - discount;

        const shipping = postDiscountAmount >= 500 ? 0 : 50;

        const finalTotal = postDiscountAmount + shipping;

        cart.items.forEach(async item => {
            if (!item.variant || !item.variant.isActive || item.variant.stock === 0) {
                // throw new Error("OUT_OF_STOCK"); // Async issue if throwing here
            }
            if (item.quantity > item.variant.stock) {
                // throw new Error...
            }
        });

        for (const item of cart.items) {
            const variant = await Variant.findById(item.variant._id);

            if (!variant || !variant.isActive || variant.stock < item.quantity) {
                throw new Error("OUT_OF_STOCK");
            }
        }

        // Deduct stock AFTER validation
        for (const item of cart.items) {
            await Variant.findByIdAndUpdate(
                item.variant._id,
                { $inc: { stock: -item.quantity } }
            );
        }

        // Create Order
        const order = await Order.create({
            userId,
            orderId: "ORD-" + Date.now(),
            items: orderItems,
            subtotal,
            discount,
            couponId,
            shipping,
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

        //  Update coupon usage ONLY AFTER order success 
        if (couponId) {
            await Coupon.updateOne(
                { _id: couponId },
                {
                    $inc: { usageCount: 1 },
                    $push: { usedBy: { userId, usedAt: new Date() } }
                }
            );
        }

        // Clear cart 
        await Cart.deleteOne({ user: userId });

        // Redirect
        res.redirect(`/order-confirmation/${order._id}`);

    }
    catch (error) {
        console.error("❌ Place Order Error:", error);
        console.error("Stack:", error.stack);
        // If validation error, log details
        if (error.name === 'ValidationError') {
            console.error("Validation Details:", JSON.stringify(error.errors, null, 2));
        }
        if (error.message === "OUT_OF_STOCK" || error.message === "STOCK_LIMIT_EXCEEDED") {
            return res.redirect("/checkout");
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


