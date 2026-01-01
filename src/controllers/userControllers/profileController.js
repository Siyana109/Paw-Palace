import User from "../../model/userModel.js";
import Address from "../../model/addressModel.js";

const getProfile = async (req, res) => {
    try {
        // assuming user id is stored in session after login
        const userId = req.session.user?.id;

        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId).lean();

        if (!user) {
            return res.redirect('/login');
        }

        const isEditing = req.query.edit === 'true';

        res.render('user/profile', {
            title: 'My Profile | PawPalace',
            user,
            isEditing
        });

    } catch (error) {
        console.error('Profile page error:', error);
        res.status(500).render('error', {
            message: 'Failed to load profile'
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

        /* ---------- Validation ---------- */
        if (!name || name.trim().length < 3) {
            return res.status(400).render('user/profile', {
                title: 'My Profile | PawPalace',
                user: await User.findById(userId).lean(),
                isEditing: true,
                error: 'Name must be at least 3 characters'
            });
        }

        if (phone && !/^[0-9]{10}$/.test(phone)) {
            return res.status(400).render('user/profile', {
                error: 'Phone number must be 10 digits',
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

    if(!address) return res.redirect('/profile')

    res.render('user/addressForm',{
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


export default { getProfile, updateProfile, getAddAddress, getEditAddress, addAddress, updateAddress, deleteAddress}