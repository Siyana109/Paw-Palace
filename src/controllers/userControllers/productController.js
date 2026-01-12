import Product from "../../model/productModel.js";
import Variant from "../../model/variantModel.js";
import Wishlist from "../../model/wishlistModel.js";
import Cart from "../../model/cartModel.js";


const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId)
      .populate("brandId")
      .populate("categoryId");

    if (!product || !product.isActive) {
      return res.redirect("/home");
    }

    const variants = await Variant.find({
      product: productId,
      stock: { $gt: 0 }
    });

    if (!variants.length) {
      return res.redirect("/home");
    }

    let inWishlist = false;
    let isInCart = false;

    if (req.session.user) {
      const userId = req.session.user.id;
      const variantId = variants[0]._id;

      inWishlist = !!await Wishlist.findOne({ user: userId, variant: variantId });
      isInCart = !!await Cart.findOne({
        user: userId,
        "items.variant": variantId
      });
    }

    const relatedProducts = await Product.find({
      isActive: true,
      categoryId: product.categoryId,
      _id: { $ne: productId }
    }).limit(4);

    res.render("user/productDetails", {
      product,
      variants,
      relatedProducts,
      inWishlist,
      isInCart
    });

  } catch (err) {
    console.error(err);
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

    return res.json({
      success: true,
      message: "Added to cart",
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

    const existing = await Wishlist.findOne({
      user: userId,
      variant: variantId
    });

const variant = await Variant.findById(variantId).populate("product");

if (!variant || !variant.product || !variant.product.isActive) {
  return res.status(400).json({
    success: false,
    redirect: "/home"
  });
}

    // ❤️ REMOVE FROM WISHLIST
    if (existing) {
      await Wishlist.deleteOne({ _id: existing._id });

      return res.json({
        success: true,
        removed: true
      });
    }

    // 🤍 ADD TO WISHLIST
    await Wishlist.create({
      user: userId,
      product: productId,
      variant: variantId
    });

    res.json({
      success: true,
      added: true
    });

  } catch (error) {
    console.error("Wishlist toggle error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};



export default { getProductDetails, addToCart, addToWishlist };
