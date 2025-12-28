import User from "../../model/userModel.js";

// const getProfile = async (req, res) => {
//     try {
//         // assuming user id is stored in session after login
//         // const userId = req.session.user?.id;

//         // if (!userId) {
//         //     return res.redirect('/login');
//         // }

//         // const user = await User.findById(userId).lean();

//         // if (!user) {
//         //     return res.redirect('/login');
//         // }

//         // const isEditing = req.query.edit === 'true';

//         res.render('user/profile', {
//             title: 'My Profile | PawPalace',
//             user: 
//             isEditing
//         });

//     } catch (error) {
//         console.error('Profile page error:', error);
//         res.status(500).render('error', {
//             message: 'Failed to load profile'
//         });
//     }
// };


export const getProfile = (req, res) => {
  // Dummy user data for UI testing
  const user = {
    fullName: "John Doe",
    email: "john.doe@example.com",
    phone: "+1 987 654 3210",
    profilePic: "https://picsum.photos/150",
    referralCode: "PAW123",
    addresses: [
      {
        id: 1,
        label: "Home",
        type: "primary",
        street: "123 Paw Street",
        city: "Petville",
        state: "CA",
        zip: "90210",
        phone: "+1 987 654 3210",
        isDefault: true
      },
      {
        id: 2,
        label: "Office",
        type: "work",
        street: "456 Bone Avenue",
        city: "Dogtown",
        state: "NY",
        zip: "10001",
        phone: "+1 123 456 7890",
        isDefault: false
      }
    ]
  };

  res.render("user/profile", {
    user,
    isEditing: false // change to true to test edit mode
  });
};



const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user?.id;

        if (!userId) {
            return res.redirect('/login');
        }

        const { name, email, phone } = req.body;

        /* ---------- Validation ---------- */
        if (!name || name.trim().length < 3) {
            return res.status(400).render('user/profile', {
                title: 'My Profile | PawPalace',
                user: await User.findById(userId).lean(),
                isEditing: true,
                error: 'Name must be at least 3 characters'
            });
        }

        if (!email) {
            return res.status(400).render('user/profile', {
                title: 'My Profile | PawPalace',
                user: await User.findById(userId).lean(),
                isEditing: true,
                error: 'Email is required'
            });
        }

        /* ---------- Email uniqueness check ---------- */
        const existingUser = await User.findOne({
            email,
            _id: { $ne: userId }
        });

        if (existingUser) {
            return res.status(400).render('user/profile', {
                title: 'My Profile | PawPalace',
                user: await User.findById(userId).lean(),
                isEditing: true,
                error: 'Email already in use'
            });
        }

        /* ---------- Update ---------- */
        await User.findByIdAndUpdate(
            userId,
            {
                fullName: name,
                email,
                phone
            },
            { new: true }
        );

        return res.redirect('/profile');

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).render('error', {
            message: 'Failed to update profile'
        });
    }
};


export default {getProfile, updateProfile}