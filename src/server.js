// Import the express library to create and manage the server
import express from "express";
// Import the path module for handling file paths
import path from "path";
// Import the fileURLToPath function to convert file URLs to paths
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

dotenv.config()
connectDB();

// Get the current filename and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an instance of the express application
const app = express();
const port = process.env.PORT || 3000;

// Configure middleware to handle different types of data
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));
// Middleware to parse JSON bodies
app.use(express.json());


// Set up the view engine and views directory for rendering dynamic content
// Set EJS as the view engine
app.set("view engine", "ejs");
// Set the directory where the view files are located
app.set("views", path.join(__dirname, "views"));


// Serve static files (like CSS, images, and client-side JavaScript) from the 'public' directory
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Define a route for the root URL ("/")
app.get("/", (req, res) => {
    // Render the 'index' view (index.ejs) and pass in some data
    res.render("index", {
        title: "Tracker App",
        message: "Welcome to your Tailwind-powered tracker!",
    });
});




// Start the server and listen for incoming requests
app.listen(port, () => {
    console.log(`Express server started at http://localhost:${port}`);
});