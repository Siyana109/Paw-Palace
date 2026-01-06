import "dotenv/config";
import express from "express";
import path from "path";
// Import the fileURLToPath function to convert file URLs to paths
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import session from "express-session";
import MongoStore from "connect-mongo";
import viewDataMiddleware from './middlewares/viewDataMiddleware.js';
import passport from "passport";
import "./config/passport.js";
import attachUserToViews from "./middlewares/viewUser.js";

connectDB();

// Get the current filename and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const port = process.env.PORT || 3000;


app.use(express.urlencoded({ extended: true }));
// Middleware to parse JSON bodies
app.use(express.json());


app.set("view engine", "ejs");
// Set the directory where the view files are located
app.set("views", path.join(__dirname, "views"));


// Serve static files (like CSS, images, and client-side JavaScript) from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));



app.use(
  session({
    name: "pawpalace.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions"
    }),
    cookie: {
      httpOnly: true,
      secure: false, // true only in HTTPS
      maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());


app.use(viewDataMiddleware);

app.use(attachUserToViews);
app.use('/',userRoutes)
app.use('/admin',adminRoutes)

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});


app.listen(port, () => {
    console.log(`Express server started at http://localhost:${port}`);
});