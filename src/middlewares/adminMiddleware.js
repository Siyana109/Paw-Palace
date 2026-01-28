const adminSession = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }

  const isAjax =
    req.xhr ||
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    (req.headers.accept && req.headers.accept.includes("application/json"));

  if (isAjax) {
    return res.status(401).json({
      success: false,
      message: "Session expired"
    });
  }

  return res.redirect("/admin/login");
};


const isAdminLoggedIn = (req, res, next) => {
  if (req.session.isAdmin) {
    return res.redirect('/admin/users');
  }
  next();
};



export default { adminSession, isAdminLoggedIn }