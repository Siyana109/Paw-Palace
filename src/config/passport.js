import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../model/userModel.js";

async function generateReferralCode() {
  let code;
  let exists;

  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    exists = await User.findOne({ referralCode: code });
  } while (exists);

  return code;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value.toLowerCase();

        let user = await User.findOne({
          $or: [
            { googleId: profile.id },
            { email }
          ]
        });

        if (!user) {

          const referralCode = await generateReferralCode();

          user = await User.create({
            fullName: profile.displayName,
            email,
            googleId: profile.id,
            emailVerified: true,
            password: "GOOGLE_AUTH",
            referralCode
          });

        } else if (!user.googleId) {
          user.googleId = profile.id;
          user.emailVerified = true;
          await user.save();
        }

        return done(null, user);

      } catch (err) {
        console.error("Google Auth Error:", err);
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});