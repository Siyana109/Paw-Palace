import Wallet from "../../model/walletModel.js";
import User from "../../model/userModel.js";

const getWalletPage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user.id;

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.redirect("/login");
    }

    let wallet = await Wallet.findOne({ user: userId }).lean();

    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        balance: 0,
        transactions: []
      });
    }

    res.render("user/wallet", {
      user,
      wallet
    });

  } catch (error) {
    console.error("Get Wallet Error:", error);
    res.status(500).render("error/500");
  }
};


const creditWallet = async ({ userId, amount, description, orderId }) => {
  let wallet = await Wallet.findOne({ user: userId });

  if (!wallet) {
    wallet = await Wallet.create({ user: userId, balance: 0, transactions: [] });
  }

  wallet.balance += amount;

  wallet.transactions.push({
    type: "Credit",
    amount,
    description,
    orderId,
    date: new Date()
  });

  await wallet.save();
};



const debitWallet = async ({
  userId,
  amount,
  description,
  orderId = null
}) => {
  const wallet = await Wallet.findOne({ user: userId });

  if (!wallet) throw new Error("Wallet not found");

  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance");
  }

  wallet.balance -= amount;

  wallet.transactions.push({
    type: "Debit",
    amount,
    description,
    orderId,
    date: new Date()
  });

  await wallet.save();

  console.log("Wallet balance:", wallet.balance);
  console.log("Trying to deduct:", amount);

};


export default { getWalletPage, creditWallet, debitWallet }