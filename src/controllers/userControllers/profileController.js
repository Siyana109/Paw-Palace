import User from "../../model/userModel.js";
import Address from "../../model/addressModel.js";
import bcrypt from "bcrypt"
import { generateOTP } from "../../../utils/otp.js";
import { sendOTPEmail } from "../../../utils/sendEmail.js";
import OTP from "../../model/otpModel.js"


const getProfile = async (req, res) => {
    try {
        const userId = req.session.user?.id;

        // 🔐 Safety check
        if (!userId) {
            return res.redirect('/login');
        }

        // 👤 Fetch user
        const user = await User.findById(userId).lean();
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        // 📍 Fetch addresses
        const addresses = await Address.find({ userId }).lean();

        // ✏️ Edit mode
        const isEditing = req.query.edit === 'true';

        // 🧩 Render
        res.render('user/profile', {
            title: 'My Profile | PawPalace',
            user,
            addresses,
            isEditing,

            // 🔽 IMPORTANT: defaults for shared partials
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



// export const getProfile = async (req, res) => {
//     try{
//     // Dummy user data for UI testing
//     const user = {
//         fullName: "John Doe",
//         email: "john.doe@example.com",
//         phone: "+1 987 654 3210",
//         profilePic: "https://picsum.photos/150",
//         referralCode: "PAW123",
//         addresses: [
//             {
//                 id: 1,
//                 label: "Home",
//                 type: "primary",
//                 street: "123 Paw Street",
//                 city: "Petville",
//                 state: "CA",
//                 zip: "90210",
//                 phone: "+1 987 654 3210",
//                 isDefault: true
//             },
//             {
//                 id: 2,
//                 label: "Office",
//                 type: "work",
//                 street: "456 Bone Avenue",
//                 city: "Dogtown",
//                 state: "NY",
//                 zip: "10001",
//                 phone: "+1 123 456 7890",
//                 isDefault: false
//             }
//         ]
//     };

//      const isEditing = req.query.edit === 'true'

//     res.render("user/profile", {
//         user,
//         isEditing// change to true to test edit mode
//     });
// }

//     catch (error) {
//         console.error('Profile page error:', error);
//         res.status(500).render('error', {
//             message: 'Failed to load profile'
//         });
//     }
// };



const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user?.id;

        if (!userId) {
            return res.redirect('/login');
        }

        const { name, phone } = req.body;

        const user = await User.findById(userId).lean();
        const addresses = await Address.find({ userId }).lean();

        /* ---------- Validation ---------- */
        if (!name || name.trim().length < 3) {
            return res.status(400).render('user/profile', {
                title: 'My Profile | PawPalace',
                user: await User.findById(userId).lean(),
                addresses,
                isEditing: true,
                error: 'Name must be at least 3 characters'
            });
        }

        if (phone && !/^[0-9]{10}$/.test(phone)) {
            return res.status(400).render('user/profile', {
                error: 'Phone number must be 10 digits',
                addresses,
                user,
                isEditing: true
            });
        }

        /* ---------- Update ---------- */
        await User.findByIdAndUpdate(
            userId,
            {
                fullName: name,
                phone
            }
        );

        return res.redirect('/profile');

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).render('error', {
            message: 'Failed to update profile'
        });
    }
};



const getAddAddress = (req, res) => {
    res.render('user/addressForm', {
        title: "Add Address | PawPalace",
        isEdit: false,
        address: null
    })
}


const getEditAddress = async (req, res) => {
    const userId = req.session.user?.id
    const addressId = req.params.id
    const address = await Address.findOne({
        _id: addressId,
        userId
    }).lean()

    if (!address) return res.redirect('/profile')

    res.render('user/addressForm', {
        title: "Edit Address | PawPalace",
        isEdit: true,
        address
    })
}


const addAddress = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        if (!userId) return res.redirect('/login');

        const {
            fullName,
            address,
            landmark,
            city,
            state,
            zipCode,
            phone
        } = req.body;

        await Address.create({
            userId,
            fullName,
            phone,
            address,
            landMark: landmark || '',
            city,
            state,
            zipCode
        });

        res.redirect('/profile');
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Failed to add address' });
    }
};


const updateAddress = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const addressId = req.params.id;

        if (!userId) return res.redirect('/login');

        const {
            fullName,
            address,
            landmark,
            city,
            state,
            zipCode,
            phone
        } = req.body;

        await Address.findOneAndUpdate(
            { _id: addressId, userId },
            {
                fullName,
                phone,
                address,
                landMark: landmark || '',
                city,
                state,
                zipCode
            }
        );

        res.redirect('/profile');
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Failed to update address' });
    }
};


const deleteAddress = async (req, res) => {
    const userId = req.session.user?.id;
    const addressId = req.params.id;

    if (!userId) return res.redirect('/login');

    await Address.findOneAndDelete({ _id: addressId, userId });

    res.redirect('/profile');
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

        /* ---------- Validation ---------- */
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
        /* ---------- Update Password ---------- */
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();
        console.log('error 7')
        /* ---------- Success ---------- */
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
        if (!user) return res.redirect('/login');

        /* ---------- Password check ---------- */
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('user/changeEmail', {
                user,
                error: 'Incorrect password'
            });
        }
        console.log('error 1')
        /* ---------- Same email check ---------- */
        if (newEmail === user.email) {
            return res.render('user/changeEmail', {
                user,
                error: 'New email cannot be the same as current email'
            });
        }
        console.log('error 2')
        /* ---------- Email uniqueness ---------- */
        const emailExists = await User.findOne({ email: newEmail });
        if (emailExists) {
            return res.render('user/changeEmail', {
                user,
                error: 'Email already in use'
            });
        }
        console.log('error 3')
        /* ---------- Generate OTP ---------- */
        const otp = generateOTP();

        await OTP.findOneAndUpdate(
            { userId},
            {
                userId,
                email: newEmail,
                otp,
                expiresAt: new Date(Date.now() + 60 * 1000)
            },
            { upsert: true, new: true }
        );
        console.log(otp)

        await sendOTPEmail(newEmail, otp);

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
        const { otp } = req.body;

        const sessionData = req.session.emailChange;

        if (!sessionData) {
            return res.redirect('/profile');
        }

        if (
            sessionData.otp !== otp ||
            Date.now() > sessionData.expiresAt
        ) {
            return res.render('user/otpEmail', {
                email: sessionData.newEmail,
                error: 'Invalid or expired OTP'
            });
        }

        /* ---------- Update email ---------- */
        await User.findByIdAndUpdate(userId, {
            email: sessionData.newEmail
        });

        delete req.session.emailChange;

        res.redirect('/profile');

    } catch (error) {
        console.error('Verify email OTP error:', error);

        const sessionData = req.session.emailChange;

        return res.status(500).render('user/otpEmail', {
            title: 'Verify Email | PawPalace',
            email: sessionData?.newEmail,
            error: 'Something went wrong. Please try again.'
        });
    }

};


const resendEmailOtp = async (req, res) => {
    const sessionData = req.session.emailChange;
    if (!sessionData) return res.redirect('/profile');

    const otp = generateOTP();

     await OTP.findOneAndUpdate(
            { userId},
            {
                userId,
                email: newEmail,
                otp,
                expiresAt: new Date(Date.now() + 60 * 1000)
            },
            { upsert: true, new: true }
        );

    await sendOTPEmail(sessionData.newEmail, otp);

    res.render('user/otpEmail', {
        email: sessionData.newEmail,
        success: 'A new OTP has been sent'
    });
};



export default {
    getProfile, updateProfile,
    getAddAddress, getEditAddress, addAddress, updateAddress, deleteAddress,
    getChangePassword, postChangePassword,
    getChangeEmail, postChangeEmail, getVerifyEmailOtp, verifyEmailOtp, resendEmailOtp
}