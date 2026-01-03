import User from "../model/userModel.js";

const attachUserToViews = async (req, res, next) => {
  try {
    if (req.session.user?.id) {
      const user = await User.findById(req.session.user.id)
        .select("fullName email");

      res.locals.user = user || null;
    } else {
      res.locals.user = null;
    }

    res.locals.currentPath = req.path;
    next();
  } catch (err) {
    console.error("View user middleware error:", err);
    res.locals.user = null;
    next();
  }
};

export default attachUserToViews;
