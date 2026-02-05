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

export default {
    getCheckoutPage,
    getOrderConfirmationPage
};
