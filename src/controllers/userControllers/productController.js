import Product from "../../model/productModel.js";
import Variant from "../../model/variantModel.js";
import Wishlist from "../../model/wishlistModel.js";
import Cart from "../../model/cartModel.js";
import Offer from "../../model/offerModel.js";

import { applyOfferToPrice } from "../../../utils/applyOffer.js";



const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    // Fetch Product
    const product = await Product.findById(productId)
      .populate("brandId")
      .populate("categoryId");

    if (!product || !product.isActive || (product.categoryId && !product.categoryId.isActive)) {
      return res.redirect("/home?unavailable=product");
    }

    // Fetch ALL Variants
    const variants = await Variant.find({ product: productId, isActive: true });

    if (!variants.length) {
      // product exists but no active variants
      return res.redirect("/home?unavailable=variant");
    }

    // Stock Computation
    const sellableVariants = variants.filter(v => v.stock > 0);
    const hasStock = sellableVariants.length > 0;

    // Default Variant (SAFE)
    const defaultVariant = hasStock ? sellableVariants[0] : variants[0];

    let inWishlist = false;
    let cartVariantIds = [];
    let wishlistVariantIds = [];

    if (req.session.user) {
      const userId = req.session.user.id;

      const cart = await Cart.findOne({ user: userId });
      if (cart) {
        cartVariantIds = cart.items.map(i => i.variant.toString());
      }

      const wishlist = await Wishlist.findOne({ user: userId });
      if (wishlist) {
        wishlistVariantIds = wishlist.items.map(i => i.variant.toString());
        if (defaultVariant) {
          inWishlist = wishlistVariantIds.includes(defaultVariant._id.toString());
        }
      }
    }

    // Normalize petType
    const petTypes = Array.isArray(product.petType)
      ? product.petType
      : [product.petType];

    const activeCategories = await import("../../model/categoryModel.js").then(m => m.default.find({ isActive: true }).select('_id'));
    const activeCategoryIds = activeCategories.map(cat => cat._id);

    // Related Products (ONLY IN-STOCK VARIANTS + ACTIVE CATEGORY)
    const relatedBaseProducts = await Product.find({
      _id: { $ne: productId },
      isActive: true,
      categoryId: { $in: activeCategoryIds },
      petType: { $in: petTypes }
    }).limit(6);

    const relatedProducts = [];

    for (const p of relatedBaseProducts) {
      const variant = await Variant.findOne({
        product: p._id,
        stock: { $gt: 0 },
        isActive: true
      });

      if (variant) {
        relatedProducts.push({ product: p, variant });
      }
    }



    // Calculate Offers
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

    // Product offer wins
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


    // Render
    res.render("user/productDetails", {
      product,
      variants,
      defaultVariant,
      hasStock,
      inWishlist,
      cartVariantIds,
      wishlistVariantIds,
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

    if (qty > 10) {
      return res.status(400).json({
        success: false,
        message: "Maximum quantity per item is 10"
      });
    }

    const userId =
      typeof req.session.user === "object"
        ? req.session.user.id
        : req.session.user;

    const variant = await Variant.findById(variantId)
      .populate({
        path: "product",
        populate: { path: "categoryId" }
      });

    if (!productId || !variantId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request"
      });
    }

    if (!variant || !variant.isActive || !variant.product || !variant.product.isActive || (variant.product.categoryId && !variant.product.categoryId.isActive)) {
      const isProductError = !variant || !variant.product || !variant.product.isActive || (variant.product.categoryId && !variant.product.categoryId.isActive);
      const reason = isProductError ? "product" : "variant";
      return res.status(400).json({
        success: false,
        message: isProductError ? "This product is no longer available" : "This variant is no longer available",
        reason: reason,
        redirect: `/home?unavailable=${reason}`
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

        if (newQty > 10) {
          return res.status(400).json({
            success: false,
            message: `Maximum quantity per item is 10`
          });
        }

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

    // REMOVE FROM WISHLIST AFTER ADDING TO CART
    await Wishlist.updateOne(
      { user: userId },
      { $pull: { items: { variant: variantId } } }
    );

    const cartCount = cart.items.length

    return res.json({
      success: true,
      message: "Added to cart",
      removedFromWishlist: true,
      cartCount,
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

    let stockAdjusted = false;

    cart.items = cart.items.filter(item => {
      if (!item.variant || item.variant.stock === 0) {
        stockAdjusted = true;
        return false; // remove item
      }

      if (item.variant.stock < item.quantity) {
        item.quantity = item.variant.stock;
        stockAdjusted = true;
      }

      return true;
    });

    if (stockAdjusted) {
      await cart.save();
    }

    // Fetch active offers ONCE
    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    // Apply offers to each cart item
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

    const stockIssues = cart.items.filter(item =>
      !item.variant || !item.variant.isActive ||
      !item.product || !item.product.isActive ||
      !item.product.categoryId || !item.product.categoryId.isActive ||
      item.variant.stock === 0 || item.quantity > item.variant.stock
    );

    res.render('user/cart', {
      cart,
      hasStockIssues: stockIssues.length > 0,
      stockIssues,
      stockAdjusted
    });

  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).send('Server Error');
  }
};



const updateCartQuantity = async (req, res) => {
  try {
    const { variantId, quantity } = req.body;
    const userId = req.session.user.id;

    if (!variantId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: "Invalid request"
      });
    }

    const newQty = parseInt(quantity, 10);

    if (isNaN(newQty) || newQty < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid quantity"
      });
    }

    if (newQty > 10) {
      return res.status(400).json({
        success: false,
        message: "Maximum quantity per item is 10"
      });
    }

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

    const variant = await Variant.findById(variantId)
      .populate({
        path: "product",
        populate: { path: "categoryId" }
      });

    if (!variant || !variant.isActive || !variant.product || !variant.product.isActive || (variant.product.categoryId && !variant.product.categoryId.isActive)) {
      return res.status(404).json({
        success: false,
        message: "Product unavailable"
      });
    }

    if (newQty > variant.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock} items available`
      });
    }

    item.quantity = newQty;

    await cart.save();

    const cartCount = cart.items.length

    return res.json({
      success: true,
      quantity: item.quantity,
      cartCount
    });

  } catch (error) {
    console.error("Update cart error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};



const removeCartItem = async (req, res) => {
  try {
    const { variantId } = req.body;

    const userId = req.session.user.id;

    await Cart.updateOne({ user: userId },
      { $pull: { items: { variant: variantId } } });

    const cart = await Cart.findOne({ user: userId });
    const cartCount = cart ? cart.items.length : 0;

    res.json({ success: true, cartCount });
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

    const allItems = wishlistDoc ? wishlistDoc.items : [];

    const wishlistItems = allItems.filter(item =>
      item.variant && item.variant.isActive &&
      item.product && item.product.isActive &&
      item.product.categoryId && item.product.categoryId.isActive
    );

    // How many items were silently removed
    const removedCount = allItems.length - wishlistItems.length;

    // Active offers
    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    // Apply offers
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
      wishlist: wishlistItems,
      removedCount
    });

  } catch (error) {
    console.error("Get Wishlist Error:", error);
    res.redirect("/home");
  }
};



const addToWishlist = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        redirect: "/login"
      });
    }

    const userId = req.session.user.id;
    const { productId, variantId } = req.body;

    // Check product and variant are active before adding to wishlist
    const variant = await Variant.findById(variantId)
      .populate({
        path: "product",
        populate: { path: "categoryId" }
      });

    if (
      !variant ||
      !variant.isActive ||
      !variant.product ||
      !variant.product.isActive ||
      (variant.product.categoryId && !variant.product.categoryId.isActive)
    ) {
      const isProductError = !variant || !variant.product || !variant.product.isActive || (variant.product.categoryId && !variant.product.categoryId.isActive);
      const reason = isProductError ? "product" : "variant";
      return res.status(400).json({
        success: false,
        message: isProductError ? "This product is no longer available" : "This variant is no longer available",
        reason: reason,
        redirect: `/home?unavailable=${reason}`
      });
    }

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({
        user: userId,
        items: [{ product: productId, variant: variantId }]
      });
      await wishlist.save();
      return res.json({ success: true, added: true, wishlistCount: wishlist.items.length });
    }

    const exists = wishlist.items.some(
      item => item.variant.toString() === variantId
    );

    if (exists) {
      wishlist.items = wishlist.items.filter(
        item => item.variant.toString() !== variantId
      );
      await wishlist.save();
      return res.json({ success: true, removed: true, wishlistCount: wishlist.items.length });
    }

    wishlist.items.push({ product: productId, variant: variantId });
    await wishlist.save();

    return res.json({ success: true, added: true, wishlistCount: wishlist.items.length });

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

    const wishlist = await Wishlist.findOne({ user: userId });
    const wishlistCount = wishlist ? wishlist.items.length : 0;

    res.json({ success: true, wishlistCount });

  } catch (error) {
    console.error("Remove wishlist error:", error);
    res.status(500).json({ success: false });
  }
};




// Validate cart items before proceeding to checkout (called via AJAX)
const validateCart = async (req, res) => {
  try {

    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const cart = await Cart.findOne({ user: userId })
      .populate({
        path: "items.product",
        populate: { path: "categoryId" }
      })
      .populate("items.variant");

    if (!cart || cart.items.length === 0) {
      return res.json({
        success: false,
        isEmpty: true,
        message: "Your cart is empty"
      });
    }

    const issues = [];

    for (const item of cart.items) {

      const product = item.product;
      const category = product?.categoryId;
      const variant = item.variant;

      if (!product || !product.isActive) {
        issues.push({
          type: "PRODUCT_INACTIVE",
          productName: product?.productName || "Product"
        });
        continue;
      }

      if (!category || !category.isActive) {
        issues.push({
          type: "CATEGORY_INACTIVE",
          productName: product.productName
        });
        continue;
      }

      if (!variant || !variant.isActive) {
        issues.push({
          type: "VARIANT_INACTIVE",
          productName: product.productName
        });
        continue;
      }

      if (variant.stock === 0) {
        issues.push({
          type: "OUT_OF_STOCK",
          productName: product.productName
        });
        continue;
      }

      if (item.quantity > variant.stock) {
        issues.push({
          type: "EXCEEDS_STOCK",
          productName: product.productName,
          available: variant.stock
        });
      }
    }

    if (issues.length > 0) {
      return res.json({
        success: true,
        hasIssues: true,
        issues
      });
    }

    return res.json({
      success: true,
      hasIssues: false
    });

  } catch (error) {
    console.error("Cart validation error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  }
};


export default { getProductDetails, getCartPage, addToCart, updateCartQuantity, removeCartItem, addToWishlist, getWishlist, removeFromWishlist, validateCart };

