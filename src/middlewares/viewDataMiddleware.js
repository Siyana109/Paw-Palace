import Cart from '../model/cartModel.js';
import Wishlist from '../model/wishlistModel.js';

const viewDataMiddleware = async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.user = req.session?.user || null;

  if (req.session?.user?.id) {
    const userId = req.session.user.id;

    const cart = await Cart.findOne({ user: userId });
    const wishlist = await Wishlist.findOne({ user: userId });

    res.locals.cartCount = cart
      ? cart.items.length
      : 0;

    res.locals.wishlistCount = wishlist ? wishlist.items.length : 0;
  } else {
    res.locals.cartCount = 0;
    res.locals.wishlistCount = 0;
  }

  next();
};

export default viewDataMiddleware;
