import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
    }
});

export const sendOTPEmail = async (email, otp) => {
    await transporter.sendMail({
        from: `"PawPalace 🐾" <${process.env.EMAIL}>`,
        to: email,
        subject: "Verify your PawPalace account",
        html: `
            <h2>Email Verification</h2>
            <p>Your OTP is:</p>
            <h1>${otp}</h1>
            <p>This OTP expires in 30 seconds.</p>
        `
    });
};