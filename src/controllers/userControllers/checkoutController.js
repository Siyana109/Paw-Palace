import Address from "../../model/addressModel.js";
import Cart from "../../model/cartModel.js";
import Coupon from "../../model/couponModel.js";
import Offer from "../../model/offerModel.js";
import Order from "../../model/orderModel.js";
import Variant from "../../model/variantModel.js";
import razorpay from "../../config/razorpay.js"
import Wallet from "../../model/walletModel.js"
import crypto from "crypto"
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

    // Fetch active offers ONCE
    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    // Recalculate offers for each cart item
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

    const allowedMethods = ["COD", "ONLINE", "WALLET"];
    if (!allowedMethods.includes(paymentDetails)) {
      return res.redirect("/checkout");
    }

    let paymentMethod =
      paymentDetails === "ONLINE" ? "RAZORPAY" : paymentDetails;

    // FETCH CART
    const cart = await Cart.findOne({ user: userId })
      .populate("items.product")
      .populate("items.variant");

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    // FETCH ADDRESS
    const addressDoc = await Address.findOne({ _id: addressId, userId });
    if (!addressDoc) return res.redirect("/checkout");

    // VALIDATE STOCK (ONLY CHECK)
    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant._id);

      if (!variant || !variant.isActive || variant.stock < item.quantity) {
        throw new Error("OUT_OF_STOCK");
      }
    }

    // CALCULATIONS (KEEP YOUR LOGIC)

    let subtotal = 0;
    let offerDiscount = 0;
    let discount = 0;
    let couponId = null;
    const orderItems = [];

    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    });

    for (const item of cart.items) {
      const { offerApplied, finalPrice } = applyOfferToPrice({
        price: item.variant.price,
        productId: item.product._id,
        categoryId: item.product.categoryId,
        activeOffers,
      });

      const price = offerApplied ? finalPrice : item.variant.price;
      const originalAmount = item.variant.price * item.quantity;
      const discountedAmount = price * item.quantity;

      subtotal += originalAmount;
      offerDiscount += originalAmount - discountedAmount;

      orderItems.push({
        productId: item.product._id,
        variantId: item.variant._id,
        productName: item.product.productName,
        variantName: item.variant.size || item.variant.color || "",
        price,
        quantity: item.quantity,
        totalAmount: discountedAmount,
        couponDiscount: 0,
      });
    }

    // COUPON CALCULATION
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode,
        isActive: true,
      });

      if (coupon) {
        if (coupon.discountType === "percentage") {
          discount = (subtotal * coupon.discountValue) / 100;
          if (coupon.maximumDiscount)
            discount = Math.min(discount, coupon.maximumDiscount);
        } else {
          discount = coupon.discountValue;
        }

        discount = Math.min(discount, subtotal);
        couponId = coupon._id;
      }
    }

    const postDiscountAmount = subtotal - offerDiscount - discount;
    const shipping = postDiscountAmount >= 500 ? 0 : 50;
    const finalTotal = postDiscountAmount + shipping;

    // WALLET LOGIC
    if (paymentMethod === "WALLET") {
      const wallet = await Wallet.findOne({ userId });

      if (!wallet || wallet.balance < finalTotal) {
        return res.json({ success: false, message: "Insufficient wallet balance" });
      }

      wallet.balance -= finalTotal;
      wallet.transactions.push({
        type: "DEBIT",
        amount: finalTotal,
        description: "Order Payment",
      });
      await wallet.save();
    }

    // ONLINE (RAZORPAY)
    // Construct Order Data (Common for all methods)
    const orderPayload = {
      userId,
      orderId: "ORD-" + Date.now(),
      items: orderItems,
      subtotal,
      discount,
      couponId,
      shipping,
      totalAmount: finalTotal,
      address: {
        fullName: addressDoc.fullName,
        phone: String(addressDoc.phone),
        addressLine: addressDoc.address,
        city: addressDoc.city,
        state: addressDoc.state,
        zipCode: String(addressDoc.zipCode),
        country: "India",
      },
      payment: {
        method: paymentMethod,
        status: paymentMethod === "COD" ? "Pending" : "Paid",
      },
      orderStatus: "Processing",
    };


    if (paymentMethod === "RAZORPAY") {
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(finalTotal * 100), // amount in paisa
        currency: "INR",
        receipt: "receipt_" + Date.now(),
      });

      return res.json({
        success: true,
        razorpayOrder,
        key: process.env.RAZORPAY_KEY_ID,
        orderData: orderPayload // Pass this to frontend
      });
    }

    // COD OR WALLET → CREATE ORDER

    const order = await Order.create(orderPayload);

    // Deduct stock now
    for (const item of cart.items) {
      await Variant.findByIdAndUpdate(item.variant._id, {
        $inc: { stock: -item.quantity },
      });
    }

    await Cart.deleteOne({ user: userId });

    res.redirect(`/order-confirmation/${order._id}`);
  } catch (error) {
    console.error("Place Order Error:", error);
    res.redirect("/checkout");
  }
};


const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderData,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.json({ success: false });
    }

    // NOW CREATE ORDER HERE
    const order = await Order.create({
      ...orderData,
      payment: {
        method: "RAZORPAY",
        status: "Paid",
        razorpayPaymentId: razorpay_payment_id,
      },
      orderStatus: "Processing",
    });

    // Deduct stock
    for (const item of order.items) {
      await Variant.findByIdAndUpdate(item.variantId, {
        $inc: { stock: -item.quantity },
      });
    }

    await Cart.deleteOne({ user: order.userId });

    res.json({ success: true, orderId: order._id });
  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
};




const getPaymentFailedPage = (req, res) => {
  res.render("user/paymentFailed");
};

export default {
  getCheckoutPage,
  getOrderConfirmationPage,
  applyCoupon,
  placeOrder,
  verifyPayment,
  getPaymentFailedPage
};


