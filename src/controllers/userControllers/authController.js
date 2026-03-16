import User from "../../model/userModel.js"
import bcrypt from "bcrypt"
import OTP from "../../model/otpModel.js"
import Wallet from "../../model/walletModel.js"
import { generateOTP } from "../../../utils/otp.js";
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
    console.log("POST /signup HIT");
    const { fullName, password, confirmPassword, referralCode } = req.body;
    const email = req.body.email.trim().toLowerCase();
    const formData = { fullName, email, referralCode };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.render("user/signup", {
        errors: [{ msg: "Invalid email address" }],
        formData: { fullName, email }
      });
    }

    const nameRegex = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

    if (!fullName || !nameRegex.test(fullName.trim())) {
      return res.render("user/signup", {
        errors: [{ msg: "Name should contain only letters and spaces" }],
        formData
      });
    }

    if (fullName.trim().length < 3) {
      return res.render("user/signup", {
        errors: [{ msg: "Name must be at least 3 characters" }],
        formData
      });
    }

    if (!email) {
      return res.render("user/signup", {
        errors: [{ msg: 'Email is required' }]
      });
    }

    if (!password || password.length < 6) {
      return res.render("user/signup", {
        errors: [{ msg: "Password must be at least 6 characters" }]
      });
    }

    if (password !== confirmPassword) {
      return res.render("user/signup", {
        errors: [{ msg: "Passwords do not match" }]
      });
    }

    const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;

    if (!strongPassword.test(password)) {
      return res.render("user/signup", {
        errors: [{ msg: "Password must contain uppercase, lowercase, number and be 8+ characters" }],
        formData
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("user/signup", {
        errors: [{ msg: "Email already registered" }],
        formData
      });
    }

    const otp = generateOTP();
    console.log("Generated OTP: ", otp)

    const hashedPassword = await bcrypt.hash(password, 10);

    await OTP.findOneAndUpdate(
      { email },
      { otp, expiresAt: new Date(Date.now() + 60 * 1000) },
      { upsert: true }
    );

    await sendOTPEmail(email, otp);

    let referrerId = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode });
      if (referrer) {
        referrerId = referrer._id;
      } else {
        return res.render("user/signup", {
          errors: [{ msg: "Invalid referral code" }],
          formData
        });
      }
    }

    req.session.signupData = {
      fullName,
      email,
      password: hashedPassword,
      referrerId
    };

    req.session.otpSentAt = Date.now();

    res.redirect("/verify-otp");

  } catch (error) {
    console.error(error);
    return res.render("user/signup");
  }
};




const getVerifyOtp = (req, res) => {
  if (!req.session.signupData) {
    return res.redirect("/signup");
  }

  const otpSentAt = req.session.otpSentAt || Date.now();
  const elapsed = Math.floor((Date.now() - otpSentAt) / 1000);
  const remaining = Math.max(60 - elapsed, 0);

  res.render("user/otpSignup", {
    email: req.session.signupData.email,
    remaining
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

    const elapsed = Math.floor((Date.now() - req.session.otpSentAt) / 1000);
    const remaining = Math.max(60 - elapsed, 0);

    if (!otpData) {
      return res.render("user/otpSignup", {
        error: "OTP not found. Please resend OTP.",
        email: signupData.email,
        remaining
      });
    }

    if (otpData.expiresAt < new Date()) {
      return res.render("user/otpSignup", {
        error: "OTP expired. Please resend OTP.",
        email: signupData.email,
        remaining
      });
    }

    if (otpData.otp !== String(otp).trim()) {
      return res.render("user/otpSignup", {
        error: "Invalid OTP",
        email: signupData.email,
        remaining
      });
    }

    // Generate unique referral code
    let referralCode;
    let exists;

    do {
      referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      exists = await User.findOne({ referralCode });
    } while (exists);

    const user = await User.create({
      fullName: signupData.fullName,
      email: signupData.email,
      password: signupData.password,
      referralCode,
      referredBy: signupData.referrerId || null
    });

    // Create Wallet for new user
    const newWallet = await Wallet.create({
      user: user._id,
      balance: 0,
      transactions: []
    });

    // Handle Referral Rewards
    if (signupData.referrerId) {
      // Credit Referrer (e.g. 100)
      await Wallet.findOneAndUpdate(
        { user: signupData.referrerId },
        {
          $inc: { balance: 100 },
          $push: {
            transactions: {
              type: 'Credit',
              amount: 100,
              description: `Referral Bonus for inviting ${user.fullName}`,
              date: new Date()
            }
          }
        }
      );

      // Credit Referee (e.g. 50)
      await Wallet.findOneAndUpdate(
        { user: user._id },
        {
          $inc: { balance: 50 },
          $push: {
            transactions: {
              type: 'Credit',
              amount: 50,
              description: 'Referral Bonus for signing up',
              date: new Date()
            }
          }
        }
      );
    }

    req.session.user = { id: user._id };

    await OTP.deleteOne({ email: signupData.email });
    req.session.signupData = null;

    req.session.justSignedUp = true;

    res.redirect("/home");

  } catch (error) {
    console.error(error);
    res.render("user/otpSignup", {
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
        expiresAt: new Date(Date.now() + 60 * 1000)

      },
      { upsert: true }
    );

    await sendOTPEmail(email, otp);

    req.session.otpSentAt = Date.now();

    res.render("user/otpSignup", {
      success: "OTP resent successfully",
      email
    });

  } catch (error) {
    console.error(error);
  }
};



const googleSignup = (req, res) => {
  passport.authenticate("google", { scope: ["profile", "email"] })
    (req, res)


}



const googleCallback = (req, res) => {
  passport.authenticate("google", { failureRedirect: "/login" })(req, res, async () => {

    if (!req.user) {
      return res.redirect("/login");
    }

    req.session.user = { id: req.user._id };

    await Wallet.findOneAndUpdate(
      { user: req.user._id },
      { $setOnInsert: { balance: 0, transactions: [] } },
      { upsert: true }
    );

    req.session.save(() => {
      res.redirect("/home");
    });

  });
};



const getLogin = (req, res) => {
  try {
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
  const showSignupSuccess = req.session.justSignedUp || false;

  req.session.justSignedUp = null;
  res.render('user/home', {
    query: req.query,
    showSignupSuccess
  });
};



export const postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.render("user/login", {
        error: "Email and password are required",
      });
    }

    const user = await User.findOne({ email });

    // Check user first
    if (!user) {
      return res.render("user/login", {
        error: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("user/login", {
        error: "Invalid credentials",
      });
    }

    if (user.isBlocked) {
      return res.render("user/login", {
        error: "Your account has been blocked by admin",
      });
    }

    req.session.user = { id: user._id, };

    req.session.save(() => {
      res.redirect("/home?login=success");
    });

  } catch (error) {
    console.error("Login error:", error);
    res.render("user/login", {
      error: "Something went wrong. Please try again.",
    });
  }
};






const forgotPassword = (req, res) => {
  try {
    res.render('user/forgotPassword')
  }
  catch (error) {
    console.error('error in rendering forgot Password', error)
  }
}





const verifyEmailSendOtp = async (req, res) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email })
    if (!user) {
      return res.render("user/forgotPassword", {
        error: "No account found with this email"
      });
    }
    const otp = generateOTP();

    await OTP.findOneAndUpdate(
      { email },
      {
        otp,
        expiresAt: new Date(Date.now() + 60 * 1000)
      },
      { upsert: true }
    );

    await sendOTPEmail(email, otp);

    req.session.resetPassword = { email, otpSentAt: Date.now() };

    res.redirect("/reset-password/verify-otp");
  }
  catch (error) {
    console.error("Verify email error:", error);
    res.render("user/forgotPassword", {
      error: "Something went wrong"
    });
  }
};



const getResetOtp = (req, res) => {
  if (!req.session.resetPassword) {
    return res.redirect("/forgot-password");
  }

  const otpSentAt = req.session.resetPassword.otpSentAt || Date.now();
  const elapsed = Math.floor((Date.now() - otpSentAt) / 1000);
  const remaining = Math.max(60 - elapsed, 0);

  res.render("user/otpReset", {
    email: req.session.resetPassword.email,
    remaining
  });
};


const resendResetOtp = async (req, res) => {
  try {
    if (!req.session.resetPassword) {
      return res.redirect("/forgot-password");
    }

    const { email } = req.session.resetPassword;
    const otp = generateOTP();

    await OTP.findOneAndUpdate(
      { email },
      { otp, expiresAt: new Date(Date.now() + 60 * 1000) },
      { upsert: true }
    );

    await sendOTPEmail(email, otp);

    req.session.resetPassword.otpSentAt = Date.now();

    res.render("user/otpReset", {
      email,
      success: "OTP resent successfully",
      remaining: 60
    });
  } catch (error) {
    console.error(error);
    res.render("user/otpReset", {
      email: req.session.resetPassword?.email,
      error: "Failed to resend OTP"
    });
  }
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

    // Fetch ONLY reset-password OTP
    const otpData = await OTP.findOne({
      email
    });

    const sessionData = req.session.resetPassword;

const elapsed = Math.floor((Date.now() - sessionData.otpSentAt) / 1000);
const remaining = Math.max(60 - elapsed, 0);

    if (!otpData) {
      return res.render("user/otpReset", {
        error: "OTP not found or expired",
        email,
        remaining
      });
    }

    // Compare OTP
    if (otpData.otp !== String(otp).trim()) {
      return res.render("user/otpReset", {
        error: "Invalid OTP",
        email,
        remaining
      });
    }

    // Compare expiry correctly
    if (otpData.expiresAt < new Date()) {
      return res.render("user/otpReset", {
        error: "OTP expired",
        email,
        remaining
      });
    }

    // OTP VERIFIED
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

    if (password !== confirmPassword || password.length < 6) {
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




const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect("/home");
    }
    res.clearCookie("pawpalace.sid");
    res.redirect("/login");
  });
};



export default {
  getSignup, postSignup, verifyEmailSendOtp, getVerifyOtp, verifyOtp, resendOtp, googleSignup, googleCallback,
  getLogin, postLogin, forgotPassword, getResetOtp, verifyResetOtp, getResetPassword, resetPassword, resendResetOtp,
  landingPage, homePage, logout
}


