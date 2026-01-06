import User from "../../model/userModel.js";


const getUsers = async (req, res) => {
    try {
        
        const users = await User.find({})
            // .select("fullName email isBlocked createdAt")
            .sort({ createdAt: -1 });
console.log(users)

        const formattedUsers = users.map((user,i) => ({
            count: i+1,
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


const blockUser = async (req, res) => {
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


const unblockUser = async (req, res) => {
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

const listUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const search = req.query.q?.trim() || "";
        const status = req.query.status || "all";
        const sort = req.query.sort || "latest";

        /* ---------- Filter ---------- */
        const filter = {
            ...(search && {
                $or: [
                    { fullName: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            }),
            ...(status === "active" && { isBlocked: false }),
            ...(status === "blocked" && { isBlocked: true })
        };

        /* ---------- Sorting ---------- */
        const sortOption =
            sort === "oldest"
                ? { createdAt: 1 }
                : { createdAt: -1 };

        const totalUsers = await User.countDocuments(filter);

        const users = await User.find(filter)
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit);

        const formattedUsers = users.map((user, index) => ({
            id: user._id,
            count: (page - 1) * limit + index + 1,
            name: user.fullName,
            email: user.email,
            status: user.isBlocked ? "Blocked" : "Active",
            joinDate: user.createdAt.toDateString(),
            orderCount: 0
        }));

        res.json({
            users: formattedUsers,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            totalUsers
        });

    } catch (error) {
        console.error("User list error:", error);
        res.status(500).json({ users: [] });
    }
};




export default {getUsers, blockUser, unblockUser, listUsers}