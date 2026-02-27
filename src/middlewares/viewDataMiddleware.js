import Cart from '../model/cartModel.js';
import Wishlist from '../model/wishlistModel.js';

const viewDataMiddleware = async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.user = req.session?.user || null;

  if (req.session?.user?.id) {
    const userId = req.session.user.id;

    const cart = await Cart.findOne({ user: userId })
      .populate({ path: "items.product", populate: { path: "categoryId" } })
      .populate("items.variant");

    const wishlist = await Wishlist.findOne({ user: userId })
      .populate({ path: "items.product", populate: { path: "categoryId" } })
      .populate("items.variant");

    const validCartItems = cart ? cart.items.filter(item =>
      item.variant && item.variant.isActive &&
      item.product && item.product.isActive &&
      item.product.categoryId && item.product.categoryId.isActive
    ) : [];

    const validWishlistItems = wishlist ? wishlist.items.filter(item =>
      item.variant && item.variant.isActive &&
      item.product && item.product.isActive &&
      item.product.categoryId && item.product.categoryId.isActive
    ) : [];

    res.locals.cartCount = validCartItems.length;
    res.locals.wishlistCount = validWishlistItems.length;
  } else {
    res.locals.cartCount = 0;
    res.locals.wishlistCount = 0;
  }

  next();
};

export default viewDataMiddleware;
