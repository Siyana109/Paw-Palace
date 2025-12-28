const viewDataMiddleware = (req, res, next) => {
    res.locals.wishlistCount = req.session?.wishlist?.length || 0;
    res.locals.cartCount = req.session?.cart?.length || 0;
    res.locals.currentPath = req.path;
    res.locals.user = req.session?.user || null;
    next();
};

export default viewDataMiddleware;
