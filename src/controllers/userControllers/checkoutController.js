import Address from "../../model/addressModel.js";
import Product from "../../model/productModel.js";
import Cart from "../../model/cartModel.js";
import Coupon from "../../model/couponModel.js";
import Offer from "../../model/offerModel.js";
import Order from "../../model/orderModel.js";
import Variant from "../../model/variantModel.js";
import razorpay from "../../config/razorpay.js"
import Wallet from "../../model/walletModel.js"
import Transaction from "../../model/transactionModel.js";
import crypto from "crypto"
import { applyOfferToPrice } from "../../../utils/applyOffer.js";

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isBuyNow = req.query.buyNow === 'true';

    const addresses = await Address.find({ userId }).sort({ isDefault: -1 });

    let cart;
    if (isBuyNow && req.session.buyNowItem) {
      // Create a mock cart object from the session item
      cart = {
        items: [req.session.buyNowItem]
      };
    } else {
      // Normal flow
      cart = await Cart.findOne({ user: userId })
        .populate({
          path: "items.product",
          populate: { path: "categoryId" }
        })
        .populate("items.variant");
    }

    const today = new Date();

    const rawCoupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: today },
      expiryDate: { $gte: today }
    }).lean();

    // Optional: Filter coupons user has already exhausted?
    // Let's mark them or filter them. For now, pass all and let applyCoupon handle validation.

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    // Fetch active offers ONCE
    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    let postOfferTotal = 0;
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
        postOfferTotal += finalPrice * item.quantity;
      } else {
        postOfferTotal += item.variant.price * item.quantity;
      }
    });

    // Map coupons with applicability status
    const coupons = rawCoupons.map(coupon => {
      const userUsageCount = coupon.usedBy
        .filter(u => u.userId.toString() === userId).length;
      
      const isUsageLimitReached = coupon.usageLimit && userUsageCount >= coupon.usageLimit;
      const isMinPurchaseSatisfied = postOfferTotal >= coupon.minimumPurchase;

      return {
        ...coupon,
        isApplicable: !isUsageLimitReached && isMinPurchaseSatisfied,
        reasons: {
          usageLimit: isUsageLimitReached,
          minPurchase: !isMinPurchaseSatisfied,
          minPurchaseAmount: coupon.minimumPurchase
        }
      };
    });

    let stockIssues = [];

    cart.items.forEach(item => {
      if (!item.variant || !item.variant.isActive || item.variant.stock === 0 ||
        !item.product || !item.product.isActive ||
        !item.product.categoryId || !item.product.categoryId.isActive) {
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
      postOfferTotal,
      walletBalance: wallet ? wallet.balance : 0,
      stockIssues,
      isBuyNow
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
      user: req.currentUser
    });

  } catch (error) {
    console.error("Order Confirmation Error:", error);
    res.redirect('/home');
  }
};


const applyCoupon = async (req, res) => {
  try {
    const { couponCode, isBuyNow } = req.body;
    const userId = req.session.user.id;
    const isBuyNowFlow = isBuyNow === 'true';

    if (!couponCode) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid or inactive coupon" });
    }

    // Timezone-safe Date Validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(coupon.startDate);
    startDate.setHours(0, 0, 0, 0);
    const expiryDate = new Date(coupon.expiryDate);
    expiryDate.setHours(0, 0, 0, 0);

    if (startDate > today) {
      return res.status(400).json({ success: false, message: "This coupon is not yet active (Pending)" });
    }
    if (expiryDate < today) {
      return res.status(400).json({ success: false, message: "Coupon has expired" });
    }

    // Validate Usage Limit (Per User)
    // Count how many times THIS USER used this coupon
    const userUsageCount = coupon.usedBy
      .filter(u => u.userId.toString() === userId).length;

    // If usageLimit is set, restrict per user by that limit
    if (coupon.usageLimit && userUsageCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: `You can use this coupon only ${coupon.usageLimit} times`
      });
    }

    // --- Calculate Cart Total (Securely) ---
    let cart;
    if (isBuyNowFlow) {
      if (!req.session.buyNowItem) {
        return res.status(400).json({ success: false, message: "Session expired" });
      }
      cart = { items: [req.session.buyNowItem] };
    } else {
      cart = await Cart.findOne({ user: userId })
        .populate({ path: "items.product", populate: { path: "categoryId" } })
        .populate("items.variant");

      if (cart) {
        cart.items = cart.items.filter(item =>
          item.variant && item.variant.isActive &&
          item.product && item.product.isActive &&
          item.product.categoryId && item.product.categoryId.isActive
        );
      }
    }

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



const deductStock = async (items) => {
  for (const item of items) {
    const variantId = item.variant?._id || item.variantId;
    const result = await Variant.findOneAndUpdate({
      _id: variantId,
      stock: { $gte: item.quantity }
    },
      { $inc: { stock: -item.quantity } });
    if (!result) {
      throw new Error("Stock changed during checkout. Please try again.");
    }
  }
};



const finalizeOrder = async ({
  order,
  cart,
  userId,
  couponId,
  isBuyNowFlow,
  req
}) => {

  await deductStock(cart.items);

  if (!isBuyNowFlow) {
    await Cart.deleteOne({ user: userId });
  } else {
    req.session.buyNowItem = null;
  }

  if (couponId) {
    await Coupon.findByIdAndUpdate(couponId, {
      $inc: { usageCount: 1 },
      $push: {
        usedBy: {
          userId,
          orderId: order._id,
          usedAt: new Date()
        }
      }
    });
  }
};



const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { addressId, paymentDetails, couponCode, isBuyNow } = req.body;
    const isBuyNowFlow = isBuyNow === true || isBuyNow === 'true';

    const allowedMethods = ["COD", "ONLINE", "WALLET"];
    if (!allowedMethods.includes(paymentDetails)) {
      return res.status(400).json({ success: false, message: "Invalid payment method selected." });
    }

    let paymentMethod =
      paymentDetails === "ONLINE" ? "RAZORPAY" : paymentDetails;

    // FETCH CART OR SESSION
    let cart;
    if (isBuyNowFlow) {
      if (!req.session.buyNowItem) {
        return res.status(400).json({ success: false, message: "Your session has expired. Please try again." });
      }
      cart = { items: [req.session.buyNowItem] };
    } else {
      cart = await Cart.findOne({ user: userId })
        .populate({
          path: "items.product",
          populate: { path: "categoryId" }
        })
        .populate("items.variant");

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: "Your cart is empty. Please add items before checking out." });
      }
    }

    // FETCH ADDRESS
    const addressDoc = await Address.findOne({ _id: addressId, userId });
    if (!addressDoc) return res.status(400).json({ success: false, message: "Please select a valid delivery address." });

    // VALIDATE CATEGORY & STOCK (STRICT)
    for (const item of cart.items) {
      const variant = await Variant.findById(item.variant._id);

      if (!item.product || !item.product.isActive ||
        !item.product.categoryId || !item.product.categoryId.isActive) {
        throw new Error("One or more items in your cart are currently unavailable.");
      }

      if (!variant || !variant.isActive || variant.stock < item.quantity) {
        throw new Error(`Item ${item.product.productName} is out of stock. Please adjust your cart.`);
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
        categoryId: item.product.categoryId._id,
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
        throw new Error("The entered coupon code is invalid.");
      }

      if (new Date() > new Date(coupon.expiryDate)) {
        throw new Error("This coupon code has expired.");
      }

      const userUsageCount = coupon.usedBy.filter(u => u.userId.toString() === userId).length;
      if (coupon.usageLimit && userUsageCount >= coupon.usageLimit) {
        throw new Error("You have reached the usage limit for this coupon.");
      }

      const postOfferSubtotal = subtotal - offerDiscount;

      if (postOfferSubtotal < coupon.minimumPurchase) {
        throw new Error(`A minimum purchase of ₹${coupon.minimumPurchase} is required for this coupon.`);
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

      // Partition coupon discount across items
      let remainingDiscount = discount;
      for (let i = 0; i < orderItems.length; i++) {
        const item = orderItems[i];
        if (i === orderItems.length - 1) {
          item.couponDiscount = Math.round(remainingDiscount * 100) / 100;
        } else {
          const itemShare = (item.totalAmount / postOfferSubtotal) * discount;
          const roundedShare = Math.round(itemShare * 100) / 100;
          item.couponDiscount = roundedShare;
          remainingDiscount -= roundedShare;
        }
      }
    }


    const postDiscountAmount = Math.max(0, subtotal - offerDiscount - discount);
    const shipping = 0; // Flat shipping rate
    const finalTotal = Math.round((postDiscountAmount + shipping) * 100) / 100;


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
      isBuyNowFlow,
      orderId: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
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

      const wallet = await Wallet.findOne({ user: userId });

      if (!wallet || wallet.balance < finalTotal) {
        return res.json({ success: false, message: "Insufficient wallet balance" });
      }

      wallet.balance -= finalTotal;

      wallet.transactions.push({
        type: "Debit",
        amount: finalTotal,
        description: "Order Payment",
        date: new Date()
      });

      await wallet.save();

      const order = await Order.create({
        ...orderPayload,
        payment: {
          method: "WALLET",
          status: "Paid"
        }
      });

      await Transaction.create({
        userId,
        type: "Wallet",
        transactionId: `WAL-${Date.now()}`,
        amount: finalTotal,
        method: "WALLET",
        status: "Completed",
        description: "Wallet Debit - Order Payment"
      });

      await finalizeOrder({
        order,
        cart,
        userId,
        couponId,
        isBuyNowFlow,
        req
      });

      return res.json({ success: true, orderId: order._id });
    }

    // ONLINE (RAZORPAY)
    if (paymentMethod === "RAZORPAY") {
      // Create Order in DB with Pending status

      await deductStock(cart.items)

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

    // COD → CREATE ORDER

    const order = await Order.create(orderPayload);

    await Transaction.create({
      userId,
      type: "Order",
      transactionId: order.orderId,
      amount: order.totalAmount,
      method: order.payment.method,
      status: order.payment.status,
      description: `Order Payment (${order.payment.method})`
    })

    await finalizeOrder({
      order,
      cart,
      userId,
      couponId,
      isBuyNowFlow,
      req
    });

    return res.json({ success: true, orderId: order._id });

  } catch (error) {
    console.error("Place Order Error:", error);
    return res.status(500).json({ success: false, message: error.message || "An unexpected error occurred while placing your order." });
  }
};




const restoreStock = async (order) => {

  for (const item of order.items) {
    await Variant.findByIdAndUpdate(item.variantId, {
      $inc: { stock: item.quantity }
    });
  }

};




const restoreCart = async (order) => {

  let cart = await Cart.findOne({ user: order.userId });

  if (!cart) {
    cart = new Cart({
      user: order.userId,
      items: []
    });
  }

  for (const item of order.items) {

    const existingItem = cart.items.find(
      i => i.variant.toString() === item.variantId.toString()
    );

    if (existingItem) {
      existingItem.quantity = item.quantity;
    } else {
      cart.items.push({
        product: item.productId,
        variant: item.variantId,
        quantity: item.quantity
      });
    }

  }

  await cart.save();
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

      const order = await Order.findById(orderId);

      if (order) {
        await restoreStock(order);
        await restoreCart(order);

        order.payment.status = "Failed";
        order.orderStatus = "Failed";
        await order.save();
      }

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

    if (order.couponId) {
      await Coupon.findByIdAndUpdate(order.couponId, {
        $inc: { usageCount: 1 },
        $push: {
          usedBy: {
            userId: order.userId,
            orderId: order._id,
            usedAt: new Date()
          }
        }
      });
    }

    if (order.isBuyNowFlow) {
      req.session.buyNowItem = null;
    } else {
      await Cart.deleteOne({ user: order.userId });
    }

    await Transaction.create({
      userId: order.userId,
      type: "Order",
      transactionId: order.orderId,
      amount: order.totalAmount,
      method: "RAZORPAY",
      status: "Paid",
      description: "Order Payment (RAZORPAY)"
    });

    order.payment.razorpayPaymentId = razorpay_payment_id;
    order.orderStatus = "Processing";

    await order.save();

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

      const order = await Order.findById(orderId);

      if (order && order.payment.status !== "Paid") {

        // restore stock
        await restoreStock(order);

        if (!order.isBuyNowFlow) {
          await restoreCart(order);
        }

        order.orderStatus = "Failed";
        order.payment.status = "Failed";

        await order.save();
      }

    }

    res.render("user/paymentFailed", { orderId });

  } catch (error) {
    console.error("Payment failed page error:", error);
    res.render("user/paymentFailed");
  }
};



const retryPayment = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { orderId } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    if (order.payment.status !== "Failed" && order.orderStatus !== "Payment Failed" && order.orderStatus !== "Failed") {
      return res.json({ success: false, message: "Order is not in a failed state" });
    }

    // Check stock availability before allowing retry
    for (const item of order.items) {
      const variant = await Variant.findById(item.variantId);
      if (!variant || variant.stock < item.quantity) {
        return res.json({ success: false, message: `Insufficient stock for ${item.productName}` });
      }
    }

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
  } catch (error) {
    console.error("Retry Payment Error:", error);
    return res.status(500).json({ success: false, message: "Failed to initiate retry" });
  }
};

const initBuyNow = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.session.user.id;

    const product = await Product.findById(productId).populate('categoryId');
    if (!product || !product.isActive) {
      return res.json({ success: false, message: "Product not available" });
    }

    const variant = await Variant.findById(variantId);
    if (!variant || variant.stock < quantity || !variant.isActive) {
      return res.json({ success: false, message: "Requested quantity not available in stock" });
    }

    // Store item specifically formatted exactly like a populated Cart Item in the session
    req.session.buyNowItem = {
      product: product,
      variant: variant,
      quantity: Number(quantity)
    };

    return res.json({ success: true });

  } catch (error) {
    console.error("Init Buy Now Error:", error);
    return res.status(500).json({ success: false, message: "Could not initiate custom checkout" });
  }
};

export default {
  getCheckoutPage,
  getOrderConfirmationPage,
  applyCoupon,
  placeOrder,
  verifyPayment,
  getPaymentFailedPage,
  retryPayment,
  initBuyNow
};


