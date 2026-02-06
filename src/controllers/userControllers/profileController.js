import User from "../../model/userModel.js";
import Address from "../../model/addressModel.js";
import Order from "../../model/orderModel.js";
import bcrypt from "bcrypt"
import { generateOTP } from "../../../utils/otp.js";
import { sendOTPEmail } from "../../../utils/sendEmail.js";
import OTP from "../../model/otpModel.js"
import cloudinary from "../../config/cloudinary.js";
import { upload } from "../../middlewares/upload.js";


const getProfile = async (req, res) => {
    try {
        const userId = req.session.user?.id;

        //  Safety check
        if (!userId) {
            return res.redirect('/login');
        }

        // Fetch user
        const user = await User.findById(userId).lean();
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        //  Fetch addresses
        const addresses = await Address.find({ userId }).lean();

        //  Edit mode
        const isEditing = req.query.edit === 'true';

        //  Render
        res.render('user/profile', {
            title: 'My Profile | PawPalace',
            user,
            addresses,
            isEditing,

            //  IMPORTANT: defaults for shared partials
            wishlistCount: 0,
            cartCount: 0,
            currentPath: req.path
        });

    } catch (error) {
        console.error('Profile page error:', error);

        res.status(500).render('user/profile', {
            title: 'My Profile | PawPalace',
            user: null,
            addresses: [],
            isEditing: false,
            wishlistCount: 0,
            cartCount: 0,
            currentPath: req.path,
            error: 'Failed to load profile'
        });
    }
};




const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) return res.redirect('/login');

        const { name, phone } = req.body;

        const user = await User.findById(userId).lean();
        const addresses = await Address.find({ userId }).lean(); // IMPORTANT

        if (!name || name.trim().length < 3) {
            return res.render('user/profile', {
                user,
                addresses,
                isEditing: true,
                error: 'Name must be at least 3 characters'
            });
        }

        if (phone && !/^\d{10}$/.test(phone)) {
            return res.render('user/profile', {
                user,
                addresses,
                isEditing: true,
                error: 'Phone number must be 10 digits'
            });
        }

        await User.findByIdAndUpdate(userId, {
            fullName: name.trim(),
            phone: phone || null
        });

        res.redirect('/profile');

    } catch (error) {
        console.error('Profile update error:', error);
        res.redirect('/profile');
    }
};




// const getAddAddress = (req, res) => {
//     res.render('user/addressForm', {
//         title: "Add Address | PawPalace",
//         isEdit: false,
//         address: null
//     })
// }


// const getEditAddress = async (req, res) => {
//     const userId = req.session.user?.id
//     const addressId = req.params.id
//     const address = await Address.findOne({
//         _id: addressId,
//         userId
//     }).lean()

//     if (!address) return res.redirect('/profile')

//     res.render('user/addressForm', {
//         title: "Edit Address | PawPalace",
//         isEdit: true,
//         address
//     })
// }


// const addAddress = async (req, res) => {
//     try {
//         const userId = req.session.user?.id;
//         if (!userId) return res.redirect('/login');

//         const {
//             fullName,
//             address,
//             landmark,
//             city,
//             state,
//             zipCode,
//             phone
//         } = req.body;

//         await Address.create({
//             userId,
//             fullName,
//             phone,
//             address,
//             landMark: landmark || '',
//             city,
//             state,
//             zipCode
//         });

//         res.redirect('/profile');
//     } catch (error) {
//         console.error(error);
//         res.status(500).render('error', { message: 'Failed to add address' });
//     }
// };

const addAddress = async (req, res) => {
    try {
        const userId = req.session.user.id;

        const {
            addressType,
            fullName,
            phone,
            address,
            landMark = '',
            city,
            state,
            zipCode,
            isDefault
        } = req.body;

        if (isDefault) {
            await Address.updateMany(
                { userId },
                { $set: { isDefault: false } }
            );
        }

        const newAddress = new Address({
            userId,
            addressType,
            fullName,
            phone,
            address,
            landMark,
            city,
            state,
            zipCode,
            isDefault: isDefault === true || isDefault === 'true'
        });

        await newAddress.save();

        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};


const editAddress = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const addressId = req.params.id;

        const {
            addressType,
            fullName,
            phone,
            address,
            landMark = '',
            city,
            state,
            zipCode,
            isDefault
        } = req.body;

        if (isDefault) {
            await Address.updateMany(
                { userId },
                { $set: { isDefault: false } }
            );
        }

        const updated = await Address.findOneAndUpdate(
            { _id: addressId, userId },
            {
                addressType,
                fullName,
                phone,
                address,
                landMark,
                city,
                state,
                zipCode,
                isDefault: isDefault === true || isDefault === 'true'
            },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false });
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};



const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const addressId = req.params.id;

        await Address.findOneAndDelete({ _id: addressId, userId });

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ success: false });
    }
};



const getChangePassword = (req, res) => {
    try {
        res.render('user/changePassword', {
            title: 'Change Password | PawPalace'
        });
    } catch (error) {
        console.error('Change password page error:', error);
        res.status(500).render('error', {
            message: 'Failed to load change password page'
        });
    }
};


const postChangePassword = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) {
            return res.redirect('/login');
        }
        console.log('error 1')
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.render('user/changePassword', {
                error: 'All fields are required'
            });
        }
        console.log('error 2')
        if (newPassword !== confirmPassword) {
            return res.render('user/changePassword', {
                error: 'New passwords do not match'
            });
        }
        console.log('error 3')
        if (newPassword.length < 6) {
            return res.render('user/changePassword', {
                error: 'Password must be at least 6 characters'
            });
        }
        console.log('error 4')
        /* ---------- Fetch User ---------- */
        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }
        console.log('error 5')
        /* ---------- Verify Current Password ---------- */
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.render('user/changePassword', {
                error: 'Current password is incorrect'
            });
        }
        console.log('error 6')
        // Update Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();
        console.log('error 7')
        // Success 
        // return res.render('user/profile', {
        //   success: 'Password updated successfully'
        // });
        req.session.profileSuccess = 'Password updated successfully';
        return res.redirect('/profile');
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).render('user/changePassword', {
            error: 'Something went wrong. Please try again.'
        });
    }
};


const getChangeEmail = async (req, res) => {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId).lean();

    if (user.googleId) {
        return res.redirect('/profile');
    }

    res.render('user/changeEmail', {
        title: 'Change Email | PawPalace',
        user
    });
};


const postChangeEmail = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) return res.redirect('/login');

        const { newEmail, password } = req.body;

        const user = await User.findById(userId);

        if (user.googleId) {
            return res.redirect('/profile');
        }

        if (!user) return res.redirect('/login');

        // Password check
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('user/changeEmail', {
                user,
                error: 'Incorrect password'
            });
        }
        console.log('error 1')
        // Same email check
        if (newEmail === user.email) {
            return res.render('user/changeEmail', {
                user,
                error: 'New email cannot be the same as current email'
            });
        }
        console.log('error 2')
        // Email uniqueness
        const emailExists = await User.findOne({ email: newEmail });
        if (emailExists) {
            return res.render('user/changeEmail', {
                user,
                error: 'Email already in use'
            });
        }
        console.log('error 3')
        // Generate OTP
        const otp = generateOTP();

        await OTP.findOneAndUpdate(
            { email: newEmail },
            {
                email: newEmail,
                otp,
                expiresAt: new Date(Date.now() + 60 * 1000)
            },
            { upsert: true, new: true }
        );

        console.log(otp)

        await sendOTPEmail(newEmail, otp);

        req.session.emailChange = {
            newEmail,
            expiresAt: new Date(Date.now() + 60 * 1000)
        };


        res.redirect('/verify-email-otp');
        console.log('error 5')

    } catch (error) {
        console.error('Change email error:', error);

        const userId = req.session.user?.id;
        const user = userId ? await User.findById(userId).lean() : null;

        return res.status(500).render('user/changeEmail', {
            title: 'Change Email | PawPalace',
            user,
            error: 'Something went wrong. Please try again.'
        });
    }

};


const getVerifyEmailOtp = (req, res) => {
    const emailChange = req.session.emailChange;
    if (!emailChange) return res.redirect('/profile');

    res.render('user/otpEmail', {
        title: 'Verify Email | PawPalace',
        email: emailChange.newEmail
    });
};


const verifyEmailOtp = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) return res.redirect('/login');

        const { otp } = req.body;
        const sessionData = req.session.emailChange;

        if (!sessionData) {
            return res.redirect('/profile');
        }

        // Fetch OTP from DB
        const otpDoc = await OTP.findOne({
            email: sessionData.newEmail
        });

        if (!otpDoc) {
            return res.render('user/otpEmail', {
                email: sessionData.newEmail,
                error: 'OTP not found or expired'
            });
        }

        if (otpDoc.expiresAt < new Date()) {
            return res.render('user/otpEmail', {
                email: sessionData.newEmail,
                error: 'OTP expired'
            });
        }

        if (otpDoc.otp !== String(otp).trim()) {
            return res.render('user/otpEmail', {
                email: sessionData.newEmail,
                error: 'Invalid OTP'
            });
        }

        // Update Email
        await User.findByIdAndUpdate(userId, {
            email: sessionData.newEmail
        });

        // cleanup
        await OTP.deleteOne({ email: sessionData.newEmail });
        delete req.session.emailChange;

        return res.redirect('/profile');

    } catch (error) {
        console.error('Verify email OTP error:', error);

        return res.status(500).render('user/otpEmail', {
            email: req.session.emailChange?.newEmail,
            error: 'Something went wrong. Please try again.'
        });
    }
};


const resendEmailOtp = async (req, res) => {
    try {
        const sessionData = req.session.emailChange;
        if (!sessionData) return res.redirect('/profile');

        const otp = generateOTP();

        await OTP.findOneAndUpdate(
            { email: sessionData.newEmail },
            {
                email: sessionData.newEmail,
                otp,
                expiresAt: new Date(Date.now() + 60 * 1000)
            },
            { upsert: true, new: true }
        );

        await sendOTPEmail(sessionData.newEmail, otp);

        return res.render('user/otpEmail', {
            email: sessionData.newEmail,
            success: 'A new OTP has been sent'
        });

    } catch (error) {
        console.error('Resend email OTP error:', error);

        return res.render('user/otpEmail', {
            email: req.session.emailChange?.newEmail,
            error: 'Failed to resend OTP. Please try again.'
        });
    }
};


const updateProfileImage = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) return res.redirect('/login');

        if (!req.file) return res.redirect('/profile');

        // upload buffer to cloudinary
        const result = cloudinary.uploader.upload_stream(
            { folder: 'pawpalace/profile' },
            async (error, uploadResult) => {
                if (error) throw error;

                await User.findByIdAndUpdate(userId, {
                    profilePic: uploadResult.secure_url
                });

                res.redirect('/profile');
            }
        ).end(req.file.buffer);

    } catch (err) {
        console.error('Profile image upload error:', err);
        res.redirect('/profile');
    }
};



const removeProfilePic = async (req, res) => {
    await User.findByIdAndUpdate(req.session.user.id, {
        profilePic: null
    });

    return res.redirect('/profile');
};


const getOrderHistory = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) return res.redirect('/login');

        const page = parseInt(req.query.page) || 1;
        const status = req.query.status || 'All';
        const limit = 10;
        const skip = (page - 1) * limit;

        let query = { userId };

        if (status !== 'All') {
            if (status === 'In Progress') {
                query.orderStatus = { $nin: ['Delivered', 'Cancelled', 'Returned', 'Failed'] };
            } else if (status === 'Failed') {
                // Check for either Order Failed OR Payment Failed
                query.$or = [
                    { orderStatus: 'Failed' },
                    { 'payment.status': 'Failed' }
                ];
            } else {
                // Delivered, Cancelled, Returned
                query.orderStatus = status;
            }
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate("items.productId")
            .populate("items.variantId")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.render('user/orderHistory', {
            title: 'Order History | PawPalace',
            orders,
            currentPage: page,
            totalPages,
            currentStatus: status,
            user: req.session.user
        });

    } catch (error) {
        console.error("Get Order History Error:", error);
        res.status(500).render('error', { message: 'Failed to load orders' });
    }
};



export default {
    getProfile, updateProfile,
    addAddress, editAddress, deleteAddress,
    getChangePassword, postChangePassword,
    getChangeEmail, postChangeEmail, getVerifyEmailOtp, verifyEmailOtp, resendEmailOtp,
    updateProfileImage, removeProfilePic, getOrderHistory
}