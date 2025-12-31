import User from "../../model/userModel.js"
import bcrypt from "bcrypt"
import OTP from "../../model/otpModel.js"
import { generateOTP} from "../../../utils/otp.js";
import { sendOTPEmail } from "../../../utils/sendEmail.js";
import passport from "passport";


const landingPage = (req, res) => {
    try {
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
    const { fullName, email, password, confirmPassword, terms } = req.body;

     if (!fullName || fullName.trim().length < 3) {
            return res.render("user/signup", {
        errors: [{ msg: 'Name must be at least 3 characters' }]
      });
        }
 if (!email) {
            return res.render("user/signup", {
        errors: [{ msg: 'Email is required' }]
      });
        }


    if (password !== confirmPassword) {
      return res.render("user/signup", {
        errors: [{ msg: "Passwords do not match" }]
      });
    }

    if (!password || password.length < 8) {
      return res.render("user/signup", {
        errors: [{ msg: "Password must be at least 8 characters" }]
      });
    }

    // if (!terms) {
    //   return res.render("user/signup", {
    //     errors: [{ msg: "Accept terms & conditions" }]
    //   });
    // }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("user/signup", {
        errors: [{ msg: "Email already registered" }]
      });
    }

    const otp = generateOTP();
    console.log("Generated OTP: ",otp)
    const hashedPassword = await bcrypt.hash(password, 10);

    await OTP.findOneAndUpdate(
      { email },
      { otp, expiresAt: new Date(Date.now() + 30 * 1000) },
      { upsert: true }
    );

    await sendOTPEmail(email, otp);

    req.session.signupData = {
      fullName,
      email,
      password: hashedPassword
    };

    res.redirect("/verify-otp");

  } catch (error) {
    console.error(error);
    res.render("user/signup");
  }
};




const getVerifyOtp = (req, res) => {
    if (!req.session.signupData) {
        return res.redirect("/signup");
    }

    res.render("user/otp", {
        email: req.session.signupData.email
    });
};


const verifyOtp = async (req, res) => {
  try {
    if (!req.session.signupData) {
      return res.redirect("/signup");
    }

    const { otp } = req.body;
    const signupData = req.session.signupData;

    const otpData = await OTP.findOne({ email: signupData.email });

    if (!otpData) {
      return res.render("user/otp", {
        error: "OTP not found. Please resend OTP.",
        email: signupData.email
      });
    }

    if (otpData.expiresAt < new Date()) {
      return res.render("user/otp", {
        error: "OTP expired. Please resend OTP.",
        email: signupData.email
      });
    }

    if (otpData.otp !== String(otp).trim()) {
      return res.render("user/otp", {
        error: "Invalid OTP",
        email: signupData.email
      });
    }

    const user = await User.create({
      fullName: signupData.fullName,
      email: signupData.email,
      password: signupData.password
    });

    req.session.user = { id: user._id };

    await OTP.deleteOne({ email: signupData.email });
    req.session.signupData = null;

    res.redirect("/home");

  } catch (error) {
    console.error(error);
    res.render("user/otp", {
      error: "Something went wrong",
      email: req.session.signupData?.email
    });
  }
};


const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.signupData;

        const otp = generateOTP();

        await OTP.findOneAndUpdate(
            { email },
            {
                otp,
                expiresAt: new Date(Date.now() + 30 * 1000)

            },
            { upsert: true }
        );

        await sendOTPEmail(email, otp);

        res.render("user/otp", {
            success: "OTP resent successfully",
            email
        });

    } catch (error) {
        console.error(error);
    }
};



const googleSignup = (req,res) => {
    passport.authenticate("google", { scope: ["profile", "email"] })
    (req, res)
}


const googleCallback = (req,res) => {
    passport.authenticate("google", {
    failureRedirect: "/login"
  })(req, res, () => {
    // Passport success → user is authenticated
    // Session is created → req.user is available
    res.redirect("/home");
  });
}




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
    // if (req.session.user) {
        res.render('user/home', { 
            user: req.session.user // Passing the user object to EJS
        });
    // } else {
    //     res.redirect('/login');
    // }
};



export const postLogin = async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  const isMatch = await bcrypt.compare(req.body.password, user.password);

  if (!isMatch || !user) {
    return res.render("user/login", { error: "Invalid credentials" });
  }

  if (user.isBlocked) {
    return res.render("user/login", {
        error: "Your account has been blocked by admin",
        success: null
    });
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





const verifyEmailSendOtp = async (req, res) => {
    try{
        const {email} = req.body
        const user = await User.findOne({email})
        if(!user){
            return res.render("user/forgotPassword", {
        error: "No account found with this email"
      });
        }
         const otp = generateOTP();

    await OTP.findOneAndUpdate(
      { email },
      { otp,
        expiresAt: new Date(Date.now() + 30 * 1000)
      },
      { upsert: true }
    );

    await sendOTPEmail(email, otp);

     req.session.resetPassword = { email };

    res.redirect("/reset-password/verify-otp");
    }
    catch (error) {
    console.error("Verify email error:", error);
    res.render("user/forgotPassword", {
      error: "Something went wrong"
    });
  }
};




// const verifyResetOtp = async (req, res) => {
//   try {
//     if (!req.session.resetPassword) {
//       return res.redirect("/forgot-password");
//     }

//     const { otp } = req.body;
//     const { email } = req.session.resetPassword;

//     const otpData = await OTP.findOne({ email });

//     if (
//       !otpData ||
//       otpData.otp !== String(otp).trim() ||
//       otpData.expiresAt < Date.now()
//     ) {
//       return res.render("user/otp", {
//         error: "Invalid or expired OTP",
//         email
//       });
//     }

//     // OTP verified → allow password reset
//     req.session.resetPassword.verified = true;

//     res.redirect("/reset-password");

//   } catch (error) {
//     console.error("Verify reset OTP error:", error);
//     res.redirect("/forgot-password");
//   }
// };


const getResetOtp = (req, res) => {
  if (!req.session.resetPassword) {
    return res.redirect("/forgot-password");
  }

  res.render("user/otp", {
    email: req.session.resetPassword.email
  });
};



const getResetPassword = (req, res) => {
  if (!req.session.resetPassword?.verified) {
    return res.redirect("/forgot-password");
  }

  res.render("user/resetPassword");
};


const verifyResetOtp = async (req, res) => {
  try {
    if (!req.session.resetPassword) {
      return res.redirect("/forgot-password");
    }

    const { otp } = req.body;
    const { email } = req.session.resetPassword;

    // 🔐 Fetch ONLY reset-password OTP
    const otpData = await OTP.findOne({
      email,
      purpose: "reset-password"
    });

    if (!otpData) {
      return res.render("user/otp", {
        error: "OTP not found or expired",
        email
      });
    }

    // Compare OTP
    if (otpData.otp !== String(otp).trim()) {
      return res.render("user/otp", {
        error: "Invalid OTP",
        email
      });
    }

    // Compare expiry correctly
    if (otpData.expiresAt < new Date()) {
      return res.render("user/otp", {
        error: "OTP expired",
        email
      });
    }

    // ✅ OTP VERIFIED
    req.session.resetPassword.verified = true;

    res.redirect("/reset-password");

  } catch (error) {
    console.error("Verify reset OTP error:", error);
    res.redirect("/forgot-password");
  }
};




const resetPassword = async (req, res) => {
  try {
    if (!req.session.resetPassword?.verified) {
      return res.redirect("/forgot-password");
    }

    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword || password.length < 8) {
      return res.render("user/resetPassword", {
        error: "Password validation failed"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.findOneAndUpdate(
      { email: req.session.resetPassword.email },
      { password: hashedPassword }
    );

    // Cleanup
    await OTP.deleteOne({ email: req.session.resetPassword.email });
    req.session.resetPassword = null;

    res.redirect("/login?message=Password+updated+successfully");

  } catch (error) {
    console.error("Reset password error:", error);
    res.redirect("/forgot-password");
  }
};





export const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect("/home");
    }
    res.clearCookie("pawpalace.sid");
    res.redirect("/login");
  });
};



export default { getSignup, postSignup, verifyEmailSendOtp, getVerifyOtp, verifyOtp, resendOtp, googleSignup, googleCallback,
                 getLogin, postLogin, forgotPassword, getResetOtp, verifyResetOtp, getResetPassword, resetPassword,
                 landingPage, homePage }


