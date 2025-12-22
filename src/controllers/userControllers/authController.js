import User from "../../model/userModel.js"
import bcrypt from "bcrypt"
import OTP from "../../model/otpModel.js"



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

        return res.redirect('/login');

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




export default { getSignup, getLogin, postSignup, forgotPassword, verifyEmail}