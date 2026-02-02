import userModel from "../model/userModel.js";

const checkSession = async (req, res, next) => {
  try {
    // No user sessions
     if (!req.session.user?.id) {
      // AJAX request
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({
          success: false,
          redirect: "/login"
        });
      }

      // Normal page request
      return res.redirect(
        "/login?message=Please+login+to+continue&alertType=info"
      );
    }

    const user = await userModel.findById(req.session.user.id);

    // User not found
     if (!user) {
      req.session.destroy();

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({
          success: false,
          redirect: "/login"
        });
      }

      return res.redirect(
        "/login?message=Account+not+found&alertType=error"
      );
    }

    // Blocked user
     if (user.isBlocked) {
      req.session.destroy();

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({
          success: false,
          message: "Account blocked"
        });
      }

      return res.redirect(
        "/login?message=Your+account+has+been+blocked&alertType=error"
      );
    }

    // Attach user
    req.currentUser = user;
    next();
  } 
  
  catch (error) {
    console.error("Session Check Error:", error);

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({
        success: false,
        message: "Session error"
      });
    }

    res.redirect(
      "/login?message=Session+error+occurred&alertType=error"
    );
  }
};



const isLoggedIn = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  next();
};

export default { checkSession, isLoggedIn };





