
const adminSession = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin/login');
    }
    next();
};


const isAdminLoggedIn = (req, res, next) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin/users');
    }
    next();
};



export default {adminSession, isAdminLoggedIn}