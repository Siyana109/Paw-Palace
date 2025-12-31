
export const adminSession = (req, res, next) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin/users');
    }
    next();
};


export const isAdminLoggedIn = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin/login');
    }
    next();
};


export default {adminSession, isAdminLoggedIn}