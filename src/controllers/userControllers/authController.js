import User from "../../model/userModel.js"
import bcrypt from "bcrypt"
import OTP from "../../model/otpModel.js"



const landingPage = (req, res) => {
    try {
        // Change '/' to the name of your EJS file (e.g., 'index')
        res.render('landing', { 
            title: 'PawPalace', // Your EJS template uses 'title', not 'pageTitle'
            // announcement: '🎁 FREE TOY with every order over $50!',
            products: [] 
        });
    } catch (error) {
        console.error('Error rendering landing page', error);
        res.status(500).render('error', {
            message: 'Error loading landing page',
            error: error.message
        });
    }
};




const getSignup = (req, res) => {
    try {
        res.render('user/signup')
    }
    catch (error) {
        console.error('Error render signup page', error)
        res.status(500).render('error', {
            message: 'Error loading signup page',
            error: error.message
        })
    }
}

const postSignup = async (req, res) => {
    try {
        const {
            fullName,
            email,
            password,
            confirmPassword,
            terms
        } = req.body;

        const errors = [];

        if (!fullName || fullName.trim().length < 3) {
            errors.push({ msg: 'Name must be at least 3 characters' });
        }

        if (!email) {
            errors.push({ msg: 'Email is required' });
        }

        if (!password || password.length < 8) {
            errors.push({ msg: 'Password must be at least 8 characters' });
        }

        if (password !== confirmPassword) {
            errors.push({ msg: 'Passwords do not match' });
        }

        if (!terms) {
            errors.push({ msg: 'You must accept the terms and conditions' });
        }

        if (errors.length > 0) {
            return res.status(400).render('user/signup');
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).render('user/signup', {
                title: 'Create Account | PawPalace',
                errors: [{ msg: 'Email is already registered' }],
                formData: {
                    fullName,
                    email
                }
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            fullName,
            email,
            password: hashedPassword
        });

        await newUser.save();

        return res.redirect('/');

    } catch (error) {
        console.error('Signup Error:', error);

        return res.status(500).render('user/signup');
    }
};


const getLogin = (req,res) => {
    try{
        res.render('user/login')
    }
    catch (error) {
        console.error('Error render login page', error)
        res.status(500).render('error', {
            message: 'Error loading login page',
            error: error.message
        })
    }
}


const homePage = (req, res) => {
    // Check if user is logged in (middleware recommended)
    // For this example, we assume user data is stored in the session
    if (req.session.user) {
        res.render('user/home', { 
            user: req.session.user // Passing the user object to EJS
        });
    } else {
        res.redirect('/login');
    }
};



export const postLogin = async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return res.render("user/login", { error: "Invalid credentials" });
  }

  req.session.user = {
    id: user._id
  };
  
  res.redirect("/home");
};




const forgotPassword = (req, res) => {
    try{
        res.render('user/forgotPassword')
    }
    catch (error){
        console.error('error in rendering forgot Password',error)
    }
}


const verifyEmail = async (req, res) => {
    try{
        const {email} = req.body
        const user = OTP.findOne({email})
        if(!user){
            return res.status(400)
        }
        res.redirect('/login')
    }
    catch(error){

    }
}


// const profile = async (req, res) => {
//     try {
//         // 1. Fetch the user data (usually from req.user if using Passport/JWT 
//         // or by querying the DB using the ID in the session)
//         const userData = await User.findById(req.session.userId); 

//         // 2. Determine if the user is in "edit mode" based on the URL query (?edit=true)
//         const isEditing = req.query.edit === 'true';

//         // 3. PASS THE DATA TO THE VIEW
//         res.render('user/profile', { 
//             user: userData,     // This must match the name used in EJS
//             isEditing: isEditing 
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).send("Internal Server Error");
//     }
// };



export const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect("/home");
    }
    res.clearCookie("pawpalace.sid");
    res.redirect("/login");
  });
};



export default { getSignup, getLogin, postLogin, postSignup, forgotPassword, verifyEmail, landingPage, homePage}


