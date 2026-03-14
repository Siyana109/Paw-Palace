

const getAdmin = (req, res) => {
    try {
        res.render('admin/login', {
            title: 'Admin Login | PawPalace',
            error: null
        });
    } catch (error) {
        console.error('Admin login page error:', error);
        res.status(500).render('error');
    }
};

const postAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).render('admin/login', {
                title: 'Admin Login | PawPalace',
                error: 'Email and password are required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).render('admin/login', {
                title: 'Admin Login | PawPalace',
                error: 'Please enter a valid email address'
            });
        }

        // Credential Check
        if (
            email === process.env.ADMIN_EMAIL &&
            password === process.env.ADMIN_PASSWORD
        ) {
            req.session.isAdmin = true;
            return res.redirect('/admin/dashboard');
        }

        // Invalid credentials
        return res.status(401).render('admin/login', {
            title: 'Admin Login | PawPalace',
            error: 'Invalid email or password'
        });

    } catch (error) {
        console.error('Admin login error:', error);
        return res.status(500).render('admin/login', {
            title: 'Admin Login | PawPalace',
            error: 'Something went wrong. Please try again.'
        });
    }
};

const adminLogout = (req, res) => {
  try {

    req.session.destroy((err) => {

      if (err) {
        console.error("Admin logout error:", err);
        return res.redirect("/admin/dashboard");
      }

      res.clearCookie("pawpalace.sid");
      return res.redirect("/admin/login");

    });

  } catch (error) {
    console.error("Admin logout failed:", error);
    res.redirect("/admin/login");
  }
};

export default { getAdmin, postAdmin, adminLogout };
