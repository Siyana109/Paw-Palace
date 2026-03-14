import Wallet from "../../model/walletModel.js";
import User from "../../model/userModel.js";
import razorpay from "../../config/razorpay.js";
import Transaction from "../../model/transactionModel.js"
import crypto from "crypto";

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

  const walletTxnId = `WAL-${Date.now()}`;

  await Transaction.create({
    userId,
    type: "Wallet",
    transactionId: walletTxnId,
    amount: amount,
    method: "WALLET",
    status: "Completed",
    description
  })
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

  await Transaction.create({
    userId,
    type: "Wallet",
    transactionId: `WAL-${Date.now()}`,
    amount,
    method: "WALLET",
    status: "Completed",
    description
  });

  console.log("Wallet balance:", wallet.balance);
  console.log("Trying to deduct:", amount);

};


const createRechargeOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.session.user.id;

    console.log("Recharge Request - Amount:", amount, "User:", userId);
    console.log("Razorpay Key ID exists:", !!process.env.RAZORPAY_KEY_ID);

    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const options = {
      amount: Math.round(amount * 100), // amount in paisa
      currency: "INR",
      receipt: `rech_${userId.toString().slice(-6)}_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("Create Recharge Order Error Full Object:", JSON.stringify(error, null, 2));
    console.error("Error Message:", error.message);

    // Razorpay often puts the message in error.error.description
    const msg = error.error?.description || error.message || JSON.stringify(error);

    res.status(500).json({ success: false, message: "Failed to create order: " + msg });
  }
};

const verifyRecharge = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.json({ success: false, message: "Invalid signature" });
    }

    // Payment Verified -> Credit Wallet
    const userId = req.session.user.id;

    await creditWallet({
      userId,
      amount: Number(amount),
      description: "Wallet Recharge (Razorpay)",
      orderId: null // No specific order ID for recharge, or could use razorpay_order_id
    });

    res.json({ success: true, message: "Wallet recharged successfully" });

  } catch (error) {
    console.error("Verify Recharge Error:", error);
    res.status(500).json({ success: false, message: "Verification failed" });
  }
};

const rechargeFailed = async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const userId = req.session.user.id;

    if (!amount) {
      return res.status(400).json({ success: false, message: "Amount missing" });
    }

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: userId, balance: 0, transactions: [] });
    }

    wallet.transactions.push({
      type: "Failed",
      amount: Number(amount),
      description: `Recharge Failed${reason ? ' (' + reason + ')' : ''}`,
      date: new Date()
    });
    await wallet.save();

    await Transaction.create({
      userId,
      type: "Wallet",
      transactionId: `WAL-F-${Date.now()}`,
      amount: Number(amount),
      method: "WALLET",
      status: "Failed",
      description: `Recharge Failed${reason ? ' (' + reason + ')' : ''}`
    });

    res.json({ success: true, message: "Failure logged" });
  } catch (error) {
    console.error("Recharge Failure Hook Error:", error);
    res.status(500).json({ success: false, message: "Failed to log" });
  }
};

export default {
  getWalletPage,
  creditWallet,
  debitWallet,
  createRechargeOrder,
  verifyRecharge,
  rechargeFailed
}