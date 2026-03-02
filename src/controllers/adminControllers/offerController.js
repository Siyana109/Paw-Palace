import Offer from "../../model/offerModel.js";
import Category from "../../model/categoryModel.js";
import Product from "../../model/productModel.js";

const getOffers = async (req, res) => {
    try {
        const {
            search = "",
            status,
            sort = "newest",
            page = 1,
            limit = 5
        } = req.query;

        // 🔄 Lazy Update: Expire offers that are past their end date
        await Offer.updateMany(
            { status: 'active', endDate: { $lt: new Date() } },
            { $set: { status: 'expired' } }
        );

        const query = {};

        // Search
        if (search) {
            query.offerName = { $regex: search, $options: "i" };
        }

        // Status filter
        if (status) {
            query.status = status;
        }

        // Sorting
        let sortQuery = {};
        switch (sort) {
            case "discount_high":
                sortQuery.discount = -1;
                break;
            case "discount_low":
                sortQuery.discount = 1;
                break;
            case "name_asc":
                sortQuery.offerName = 1;
                break;
            default:
                sortQuery.createdAt = -1; // newest
        }

        const skip = (page - 1) * limit;

        console.log("QUERY →", query);

        const offers = await Offer.find(query)
            .populate("categoryId")
            .populate("productId")
            .sort(sortQuery)
            .skip(skip)
            .limit(Number(limit));

        const totalOffers = await Offer.countDocuments(query);
        const totalPages = Math.ceil(totalOffers / limit);

        const categories = await Category.find({ isActive: true });
        const products = await Product.find({ isActive: true }, 'productName _id');

        res.render("admin/offers", {
            offers,
            totalOffers,
            totalPages,
            currentPage: Number(page),
            categories,
            products
        });
    } catch (error) {
        console.error("Get offers error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


const createOffer = async (req, res) => {
    try {
        const {
            offerName,
            discount,
            categoryId,
            productId,
            startDate,
            endDate,
            status,
            offerType,
            discountType
        } = req.body;

        const discountValue = Number(discount);

        // Basic validations
        if (!offerName || offerName.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: "Offer name must be at least 3 characters"
            });
        }

        if (!discountValue || discountValue <= 0) {
            return res.status(400).json({
                success: false,
                message: "Discount must be greater than 0"
            });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: "Start and end dates are required"
            });
        }

        if (new Date(endDate) <= new Date(startDate)) {
            return res.status(400).json({
                success: false,
                message: "End date must be after start date"
            });
        }

        if (!offerType || !["product", "category"].includes(offerType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid offer type"
            });
        }

        if (offerType === "category" && !categoryId) {
            return res.status(400).json({
                success: false,
                message: "Category is required"
            });
        }

        if (offerType === "product" && (!productId || productId.length === 0)) {
            return res.status(400).json({
                success: false,
                message: "Product is required"
            });
        }

        // Percentage Validation
        if (discountType === "percentage") {
            if (discountValue > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Percentage discount cannot exceed 100%"
                });
            }
        }

        // FIXED AMOUNT VALIDATION (IMPORTANT)
        // Fixed amount doesn't need minimum purchase validation for Offers
        // as per user request. We just allow any fixed amount.

        const newOffer = new Offer({
            offerName,
            discount: discountValue,
            offerType,
            discountType,
            categoryId: categoryId || null,
            productId: productId || [],
            startDate,
            endDate,
            status
        });

        await newOffer.save();

        res.status(201).json({
            success: true,
            message: "Offer created successfully",
            offer: newOffer
        });

    } catch (error) {
        console.error("Create offer error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};


const updateOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const discountValue = Number(data.discount);

        if (data.discountType === "percentage" && discountValue > 100) {
            return res.status(400).json({
                success: false,
                message: "Percentage discount cannot exceed 100%"
            });
        }

        // Clean up formatting to prevent Mongoose Casting Errors
        if (data.offerType === "category") {
            data.productId = [];
            data.categoryId = data.categoryId || null;
        } else if (data.offerType === "product") {
            data.categoryId = null;
            // ensure productId is array
            if (data.productId && !Array.isArray(data.productId)) {
                data.productId = [data.productId];
            } else if (!data.productId) {
                data.productId = [];
            }
        }

        const updatedOffer = await Offer.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true }
        );

        if (!updatedOffer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Offer updated successfully",
            offer: updatedOffer
        });

    } catch (error) {
        console.error("Update offer error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};



const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedOffer = await Offer.findByIdAndDelete(id);

        if (!deletedOffer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Offer deleted successfully"
        });
    } catch (error) {
        console.error("Delete offer error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


const getOfferStats = async (req, res) => {
    try {
        const active = await Offer.countDocuments({ status: "active" });
        const inactive = await Offer.countDocuments({ status: "inactive" });
        const expired = await Offer.countDocuments({ status: "expired" });

        res.status(200).json({
            success: true,
            stats: {
                active,
                inactive,
                expired
            }
        });
    } catch (error) {
        console.error("Offer stats error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export default { getOffers, createOffer, updateOffer, deleteOffer, getOfferStats }
