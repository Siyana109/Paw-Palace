import User from "../../model/userModel.js";


export const getUsers = async (req, res) => {
    try {
        const users = await User.find({})
            .select("fullName email isBlocked createdAt")
            .sort({ createdAt: -1 });
console.log(users)
        const formattedUsers = users.map(user => ({
            id: user._id.toString(),
            name: user.fullName,
            email: user.email,
            status: user.isBlocked ? "Blocked" : "Active",
            joinDate: user.createdAt.toDateString(),
            orderCount: 0 // later you can replace with real order count -- Order.countDocuments({ userId: user._id })

        }));

        res.render("admin/users", {
            users: formattedUsers
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).render("admin/error", {
            message: "Unable to load users"
        });
    }
};


export const blockUser = async (req, res) => {
    try {
        const { userId } = req.params;

        await User.findByIdAndUpdate(userId, {
            isBlocked: true
        });

        res.redirect("/admin/users");
    } catch (error) {
        console.error("Error blocking user:", error);
        res.status(500).redirect("/admin/users");
    }
};


export const unblockUser = async (req, res) => {
    try {
        const { userId } = req.params;

        await User.findByIdAndUpdate(userId, {
            isBlocked: false
        });

        res.redirect("/admin/users");
    } catch (error) {
        console.error("Error unblocking user:", error);
        res.status(500).redirect("/admin/users");
    }
};






export default {getUsers, blockUser, unblockUser}