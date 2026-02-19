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

    const wallet = await Wallet.findOne({ user: userId });

    res.render("user/checkout", {
      addresses,
      cart,
      coupons,
      walletBalance: wallet ? wallet.balance : 0,
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
    const shipping = order.shipping;

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
        code: couponCode.toUpperCase(),
        isActive: true
      });

      if (!coupon) {
        throw new Error("INVALID_COUPON");
      }

      if (new Date() > new Date(coupon.expiryDate)) {
        throw new Error("COUPON_EXPIRED");
      }

      if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
        throw new Error("COUPON_LIMIT_REACHED");
      }

      const postOfferSubtotal = subtotal - offerDiscount;

      if (postOfferSubtotal < coupon.minimumPurchase) {
        throw new Error("MINIMUM_NOT_MET");
      }

      if (coupon.discountType === "percentage") {
        discount = (postOfferSubtotal * coupon.discountValue) / 100;
        if (coupon.maximumDiscount) {
          discount = Math.min(discount, coupon.maximumDiscount);
        }
      } else {
        discount = coupon.discountValue;
      }

      discount = Math.min(discount, postOfferSubtotal);

      couponId = coupon._id;
    }

    const postDiscountAmount = subtotal - offerDiscount - discount;
    const shipping = 50; // Flat shipping rate
    const finalTotal = postDiscountAmount + shipping;

    // Distribute shipping fee across items
    const totalQuantity = orderItems.reduce((acc, item) => acc + item.quantity, 0);
    const shippingPerUnit = totalQuantity > 0 ? shipping / totalQuantity : 0;

    orderItems.forEach(item => {
      // Calculate share based on quantity
      // We use simple proportional distribution. 
      // Note: This might result in floating point variations, but for display/record it is acceptable.
      item.shippingShare = shippingPerUnit * item.quantity;
    });

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
        addressType: addressDoc.addressType,
      },
      payment: {
        method: paymentMethod,
        status:
          paymentMethod === "COD"
            ? "Pending"
            : paymentMethod === "WALLET"
              ? "Paid"
              : "Pending", // Razorpay starts as Pending
      },
      orderStatus: paymentMethod === "RAZORPAY" ? "Pending" : "Processing",
    };

    // WALLET LOGIC
    if (paymentMethod === "WALLET") {

      const order = await Order.create({
        ...orderPayload,
        payment: {
          method: "WALLET",
          status: "Pending"
        }
      });

      const wallet = await Wallet.findOne({ user: userId });

      if (!wallet || wallet.balance < finalTotal) {
        return res.json({ success: false, message: "Insufficient wallet balance" });
      }

      wallet.balance -= finalTotal;
      wallet.transactions.push({
        type: "Debit",
        amount: finalTotal,
        description: "Order Payment",
      });

      await wallet.save();

      order.payment.status = "Paid";
      await order.save();

      // deduct stock
      for (const item of cart.items) {
        await Variant.findByIdAndUpdate(item.variant._id, {
          $inc: { stock: -item.quantity },
        });
      }

      await Cart.deleteOne({ user: userId });

      return res.json({ success: true, orderId: order._id });
    }

    // ONLINE (RAZORPAY)



    if (paymentMethod === "RAZORPAY") {

      // Create Order in DB with Pending status
      const order = await Order.create({
        ...orderPayload,
        payment: {
          method: "RAZORPAY",
          status: "Pending"
        }
      });

      // Create Razorpay Order using DB order amount
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(order.totalAmount * 100),
        currency: "INR",
        receipt: order._id.toString()
      });

      return res.json({
        success: true,
        razorpayOrder,
        key: process.env.RAZORPAY_KEY_ID,
        orderId: order._id
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

    return res.json({ success: true, orderId: order._id });

  } catch (error) {
    console.error("Place Order Error:", error);
    return res.status(500).json({ success: false, message: "Failed to place order" });
  }
};


const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.json({ success: false });
    }

    // FIRST fetch order
    const order = await Order.findById(orderId);

    if (!order) {
      return res.json({ success: false });
    }

    // Prevent double processing
    if (order.payment.status === "Paid") {
      return res.json({ success: true, orderId: order._id });
    }

    // Update payment status
    order.payment.status = "Paid";
    order.payment.razorpayPaymentId = razorpay_payment_id;
    order.orderStatus = "Processing";

    await order.save();

    // Deduct stock
    for (const item of order.items) {
      await Variant.findByIdAndUpdate(item.variantId, {
        $inc: { stock: -item.quantity }
      });
    }

    // Delete cart
    await Cart.deleteOne({ user: order.userId });

    return res.json({ success: true, orderId: order._id });

  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.json({ success: false });
  }
};




const getPaymentFailedPage = async (req, res) => {
  try {
    const { orderId } = req.query;

    if (orderId) {
      await Order.findByIdAndUpdate(orderId, {
        orderStatus: "Payment Failed",
        "payment.status": "Failed"
      });
    }

    res.render("user/paymentFailed");

  } catch (error) {
    console.error("Payment failed page error:", error);
    res.render("user/paymentFailed");
  }
};



export default {
  getCheckoutPage,
  getOrderConfirmationPage,
  applyCoupon,
  placeOrder,
  verifyPayment,
  getPaymentFailedPage
};


