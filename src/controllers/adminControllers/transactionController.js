import Transaction from "../../model/transactionModel.js";
import User from "../../model/userModel.js";

const getTransactions = async (req, res) => {

  try {

    const page  = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip  = (page - 1) * limit;

    // ── Build filter query ──────────────────────────────────────────
    const { type, status, method, dateFrom, dateTo, search } = req.query;
    const query = {};

    if (type   && type   !== "all") query.type   = type;
    if (status && status !== "all") query.status = { $regex: new RegExp(`^${status}$`, "i") };
    if (method && method !== "all") query.method = { $regex: new RegExp(`^${method}$`, "i") };

    // Date range
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    // Search: match transactionId OR user name
    if (search && search.trim()) {
      const searchTerm = search.trim();
      // Find user IDs whose name or email match
      const matchingUsers = await User.find({
        $or: [
          { fullName: { $regex: searchTerm, $options: "i" } },
          { email:    { $regex: searchTerm, $options: "i" } }
        ]
      }).select("_id").lean();

      const userIds = matchingUsers.map(u => u._id);

      query.$or = [
        { transactionId: { $regex: searchTerm, $options: "i" } },
        ...(userIds.length ? [{ userId: { $in: userIds } }] : [])
      ];
    }
    // ───────────────────────────────────────────────────────────────

    const transactions = await Transaction.find(query)
      .populate("userId", "fullName email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalTransactions = await Transaction.countDocuments(query);
    const totalPages        = Math.ceil(totalTransactions / limit);

    // Gather distinct methods for the filter dropdown
    const allMethods = await Transaction.distinct("method");

    res.render("admin/transactions", {
      transactions: transactions.map(txn => ({
        ...txn,
        userDetails: txn.userId
      })),
      currentPage: page,
      totalPages,
      totalTransactions,
      currentPath: "/admin/transactions",
      // pass active filters back so the form stays populated
      filters: { type, status, method, dateFrom, dateTo, search },
      allMethods
    });

  } catch (error) {

    console.error(error);

    res.render("admin/transactions", {
      transactions: [],
      currentPage: 1,
      totalPages: 1,
      totalTransactions: 0,
      currentPath: "/admin/transactions",
      filters: {},
      allMethods: [],
      error: "Failed to load transactions"
    });

  }

};

export default { getTransactions };