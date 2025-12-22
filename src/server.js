import express from "express";
import path from "path";
// Import the fileURLToPath function to convert file URLs to paths
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js"
// import adminRoutes from "./routes/adminRoutes.js"

dotenv.config()
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


app.use('/',userRoutes)
// app.use('/admin',adminRoutes)


app.listen(port, () => {
    console.log(`Express server started at http://localhost:${port}`);
});