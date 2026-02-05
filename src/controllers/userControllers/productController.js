import Product from "../../model/productModel.js";
import Variant from "../../model/variantModel.js";
import Wishlist from "../../model/wishlistModel.js";
import Cart from "../../model/cartModel.js";
import Offer from "../../model/offerModel.js";

import { applyOfferToPrice } from "../../../utils/applyOffer.js";



const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    /* 1️⃣ Fetch Product */
    const product = await Product.findById(productId)
      .populate("brandId")
      .populate("categoryId");

    if (!product || !product.isActive) {
      return res.redirect("/home");
    }

    /* 2️⃣ Fetch ALL Variants */
    const variants = await Variant.find({ product: productId });

    if (!variants.length) {
      // product exists but no variants → admin issue
      return res.redirect("/home");
    }

    /* 3️⃣ Stock Computation */
    const sellableVariants = variants.filter(v => v.stock > 0);
    const hasStock = sellableVariants.length > 0;

    /* 4️⃣ Default Variant (SAFE) */
    const defaultVariant = hasStock ? sellableVariants[0] : variants[0];

    /* 5️⃣ Wishlist & Cart Status */
    let inWishlist = false;
    let isInCart = false;

    if (req.session.user && defaultVariant) {
      const userId = req.session.user.id;

      inWishlist = !!await Wishlist.findOne({
        user: userId,
        variant: defaultVariant._id
      });

      isInCart = !!await Cart.findOne({
        user: userId,
        "items.variant": defaultVariant._id
      });
    }

    /* 6️⃣ Normalize petType */
    const petTypes = Array.isArray(product.petType)
      ? product.petType
      : [product.petType];

    /* 7️⃣ Related Products (ONLY IN-STOCK VARIANTS) */
    const relatedBaseProducts = await Product.find({
      _id: { $ne: productId },
      isActive: true,
      petType: { $in: petTypes }
    }).limit(6);

    const relatedProducts = [];

    for (const p of relatedBaseProducts) {
      const variant = await Variant.findOne({
        product: p._id,
        stock: { $gt: 0 }
      });

      if (variant) {
        relatedProducts.push({ product: p, variant });
      }
    }



    /* 7.5️⃣ Calculate Offers */
    const currentDate = new Date();

    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      $or: [
        { productId: { $in: [productId] } },
        { categoryId: product.categoryId._id }
      ]
    });

    // 1️⃣ Product offer wins
    variants.forEach(variant => {
      const { offerApplied, finalPrice } = applyOfferToPrice({
        price: variant.price,
        productId: product._id,
        categoryId: product.categoryId._id,
        activeOffers
      });

      variant.offerApplied = offerApplied;
      if (offerApplied) {
        variant.offerPrice = finalPrice;
      }
    });


    /* 8️⃣ Render */
    res.render("user/productDetails", {
      product,
      variants,
      defaultVariant,
      hasStock,
      inWishlist,
      isInCart,
      relatedProducts,
      activeOffers
    });

  } catch (err) {
    console.error("Product details error:", err);
    res.redirect("/home");
  }
};



const addToCart = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        redirect: "/login"
      });
    }

    const { productId, variantId, quantity } = req.body;
    const qty = Number(quantity);

    if (!qty || qty < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid quantity"
      });
    }

    const userId =
      typeof req.session.user === "object"
        ? req.session.user.id
        : req.session.user;

    const variant = await Variant.findById(variantId).populate("product");

    if (!productId || !variantId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request"
      });
    }

    if (!variant || !variant.product || !variant.product.isActive) {
      return res.status(400).json({
        success: false,
        redirect: "/home"
      });
    }

    if (variant.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock} items available`
      });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({
        user: userId,
        items: [{ product: productId, variant: variantId, quantity: qty }]
      });
    } else {
      const index = cart.items.findIndex(
        item => item.variant.toString() === variantId
      );

      if (index > -1) {
        const newQty = cart.items[index].quantity + qty;

        if (newQty > variant.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${variant.stock} items available`
          });
        }

        cart.items[index].quantity = newQty;
      } else {
        cart.items.push({ product: productId, variant: variantId, quantity: qty });
      }
    }

    await cart.save();

    /* ✅ REMOVE FROM WISHLIST AFTER ADDING TO CART */
    await Wishlist.updateOne(
      { user: userId },
      { $pull: { items: { variant: variantId } } }
    );

    return res.json({
      success: true,
      message: "Added to cart",
      removedFromWishlist: true,
      redirect: "/cart"
    });

  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};


const getCartPage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userId = req.session.user.id;

    const cart = await Cart.findOne({ user: userId })
      .populate({
        path: 'items.product',
        populate: { path: 'categoryId' }
      })
      .populate('items.variant');

    if (!cart) {
      return res.render('user/cart', { cart: null, hasOutOfStock: false });
    }

    // 🔥 Fetch active offers ONCE
    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    // 🔥 Apply offers to each cart item
    cart.items.forEach(item => {
      const { finalPrice, offerApplied } = applyOfferToPrice({
        price: item.variant.price,
        productId: item.product._id,
        categoryId: item.product.categoryId._id,
        activeOffers
      });

      item.variant.offerApplied = offerApplied;
      item.variant.offerPrice = finalPrice;
    });

    const hasOutOfStock = cart.items.some(
      item => item.variant.stock === 0
    );

    res.render('user/cart', {
      cart,
      hasOutOfStock
    });

  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).send('Server Error');
  }
};


const updateCartQuantity = async (req, res) => {
  try {
    const { variantId, change } = req.body;
    const userId = req.session.user.id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false });
    }

    const item = cart.items.find(
      i => i.variant.toString() === variantId
    );

    if (!item) {
      return res.status(404).json({ success: false });
    }

    const variant = await Variant.findById(variantId);
    if (!variant) {
      return res.status(404).json({ success: false });
    }

    const newQty = item.quantity + change;

    if (newQty < 1) {
      return res.json({ success: false });
    }

    if (newQty > variant.stock) {
      return res.json({
        success: false,
        message: `Only ${variant.stock} items available`
      });
    }

    item.quantity = newQty;
    await cart.save();

    res.json({
      success: true,
      quantity: item.quantity
    });

  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ success: false });
  }
};


const removeCartItem = async (req, res) => {
  try {
    const { variantId } = req.body;

    const userId = req.session.user.id;

    await Cart.updateOne({ user: userId },
      { $pull: { items: { variant: variantId } } });

    res.json({ success: true });
  }

  catch (error) {
    console.error('Remove cart item error:', error);
    res.status(500).json({ success: false });
  }
};


const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const wishlistDoc = await Wishlist.findOne({ user: userId })
      .populate({
        path: "items.product",
        populate: { path: "categoryId" }
      })
      .populate("items.variant");

    const wishlistItems = wishlistDoc ? wishlistDoc.items : [];

    // 🔥 Active offers
    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    // 🔥 Apply offers
    wishlistItems.forEach(item => {
      const { finalPrice, offerApplied } = applyOfferToPrice({
        price: item.variant.price,
        productId: item.product._id,
        categoryId: item.product.categoryId._id,
        activeOffers
      });

      item.variant.offerApplied = offerApplied;
      item.variant.offerPrice = finalPrice;
    });

    res.render("user/wishlist", {
      wishlist: wishlistItems
    });

  } catch (error) {
    console.error("Get Wishlist Error:", error);
    res.redirect("/home");
  }
};



const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { productId, variantId } = req.body;

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({
        user: userId,
        items: [{ product: productId, variant: variantId }]
      });
      await wishlist.save();
      return res.json({ success: true, added: true });
    }

    const exists = wishlist.items.some(
      item => item.variant.toString() === variantId
    );

    if (exists) {
      wishlist.items = wishlist.items.filter(
        item => item.variant.toString() !== variantId
      );
      await wishlist.save();
      return res.json({ success: true, removed: true });
    }

    wishlist.items.push({ product: productId, variant: variantId });
    await wishlist.save();

    res.json({ success: true, added: true });

  } catch (error) {
    console.error("Wishlist toggle error:", error);
    res.status(500).json({ success: false });
  }
};



const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { variantId } = req.body;

    await Wishlist.updateOne(
      { user: userId },
      { $pull: { items: { variant: variantId } } }
    );

    res.json({ success: true });

  } catch (error) {
    console.error("Remove wishlist error:", error);
    res.status(500).json({ success: false });
  }
};





export default { getProductDetails, getCartPage, addToCart, updateCartQuantity, removeCartItem, addToWishlist, getWishlist, removeFromWishlist };
