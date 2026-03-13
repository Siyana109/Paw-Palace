import Transaction from "../../model/transactionModel.js";

const getTransactions = async (req, res) => {

  try {

    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find()
      .populate("userId", "fullName email")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalTransactions = await Transaction.countDocuments();

    const totalPages = Math.ceil(totalTransactions / limit);

    res.render("admin/transactions", {
      transactions: transactions.map(txn => ({
        ...txn,
        userDetails: txn.userId
      })),
      currentPage: page,
      totalPages,
      totalTransactions,
      currentPath: "/admin/transactions"
    });

  } catch (error) {

    console.error(error);

    res.render("admin/transactions", {
      transactions: [],
      currentPage: 1,
      totalPages: 1,
      totalTransactions: 0,
      currentPath: "/admin/transactions",
      error: "Failed to load transactions"
    });

  }

};

export default { getTransactions };