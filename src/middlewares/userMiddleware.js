import userModel from "../model/userModel.js";

const checkSession = async (req, res, next) => {
  try {
    if (!req.session.user?.id) {
      return res.redirect("/login?message=Please+login+to+continue&alertType=info");
    }

    const user = await userModel.findById(req.session.user.id);

    if (!user) {
      req.session.destroy();
      return res.redirect("/login?message=Account+not+found&alertType=error");
    }

    if (user.isBlocked) {
      req.session.destroy();
      return res.redirect("/login?message=Your+account+has+been+blocked&alertType=error");
    }

    // Optional: attach user to request
    req.currentUser = user;

    next();
  } catch (error) {
    console.error("Session Check Error:", error);
    res.redirect("/login?message=Session+error+occurred&alertType=error");
  }
};



const isLoggedIn = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  next();
};

export default { checkSession, isLoggedIn };





