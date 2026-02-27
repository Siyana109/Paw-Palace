import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import Offer from "../../model/offerModel.js";
import Wishlist from "../../model/wishlistModel.js";

import { applyOfferToPrice } from "../../../utils/applyOffer.js";

import mongoose from "mongoose";

const homePage = async (req, res) => {
  try {
    const {
      search = "",
      category,
      minPrice,
      maxPrice,
      sort = "featured",
      page = 1,
      petType
    } = req.query;

    const limit = 8;
    const skip = (page - 1) * limit;

    // Get Active Categories first
    const activeCategories = await Category.find({ isActive: true }).select('_id');
    const activeCategoryIds = activeCategories.map(cat => cat._id);

    // PRODUCT MATCH
    const productMatch = {
      isActive: true,
      categoryId: { $in: activeCategoryIds }
    };

    if (search) {
      productMatch.productName = { $regex: search, $options: "i" };
    }

    if (category) {
      // If user filters by category, ensure it's actually an active one
      if (activeCategoryIds.some(id => id.toString() === category)) {
        productMatch.categoryId = new mongoose.Types.ObjectId(category);
      } else {
        // Force no match if category is inactive
        productMatch.categoryId = null;
      }
    }

    const petTypes = [].concat(petType || []);
    if (petTypes.length) {
      productMatch.petType = { $in: petTypes };
    }

    // SORT
    let sortStage = {};

    switch (sort) {
      case "price_asc":
        sortStage = { inStock: -1, price: 1 };
        break;

      case "price_desc":
        sortStage = { inStock: -1, price: -1 };
        break;

      case "name_asc":
        sortStage = { inStock: -1, name: 1 };
        break;

      case "name_desc":
        sortStage = { inStock: -1, name: -1 };
        break;

      default:
        // Featured / newest
        sortStage = { inStock: -1, createdAt: -1 };
    }

    // AGGREGATION
    const pipeline = [
      { $match: productMatch },

      {
        $lookup: {
          from: "variants",
          localField: "_id",
          foreignField: "product",
          as: "variants"
        }
      },

      { $unwind: "$variants" },

      {
        $match: {
          "variants.isActive": true
        }
      },

      ...(minPrice || maxPrice
        ? [{
          $match: {
            "variants.price": {
              ...(minPrice && { $gte: Number(minPrice) }),
              ...(maxPrice && { $lte: Number(maxPrice) })
            }
          }
        }]
        : []),

      { $sort: { "variants.price": 1 } },
      {
        $group: {
          _id: "$_id",
          name: { $first: "$productName" },
          category: { $first: "$categoryId" },
          image: { $first: "$variants.coverImage" },
          price: { $first: "$variants.price" },
          variantId: { $first: "$variants._id" },
          createdAt: { $first: "$createdAt" },
          petType: { $first: "$petType" },

          totalStock: { $sum: "$variants.stock" }
        }
      },
      {
        $addFields: {
          inStock: {
            $cond: [{ $gt: ["$totalStock", 0] }, 1, 0]
          }
        }
      },

      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit }
    ];

    let products = await Product.aggregate(pipeline);

    const activeOffers = await Offer.find({
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    let wishlistVariantIds = new Set();
    if (req.session.user) {
      const wishlist = await Wishlist.findOne({ user: req.session.user.id });
      if (wishlist && wishlist.items) {
        wishlist.items.forEach(item => {
          if (item.variant) wishlistVariantIds.add(item.variant.toString());
        });
      }
    }

    products = products.map(product => {
      const { offerApplied, finalPrice, discountType, discountValue } =
        applyOfferToPrice({
          price: product.price,
          productId: product._id,
          categoryId: product.category,
          activeOffers
        });

      if (!offerApplied) {
        return {
          ...product,
          offerApplied: false,
          inWishlist: wishlistVariantIds.has(product.variantId.toString())
        };
      }



      return {
        ...product,
        inWishlist: wishlistVariantIds.has(product.variantId.toString()),
        offerApplied: true,
        offerPrice: finalPrice,
        offerDiscountType: discountType,
        offerDiscountVal: discountValue
      };
    });

    // COUNT
    const countPipeline = [
      { $match: productMatch },
      {
        $lookup: {
          from: "variants",
          localField: "_id",
          foreignField: "product",
          as: "variants"
        }
      },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.isActive": true
        }
      },
      ...(minPrice || maxPrice
        ? [{
          $match: {
            "variants.price": {
              ...(minPrice && { $gte: Number(minPrice) }),
              ...(maxPrice && { $lte: Number(maxPrice) })
            }
          }
        }]
        : []),
      { $group: { _id: "$_id" } }
    ];

    const totalProducts = (await Product.aggregate(countPipeline)).length;
    const totalPages = Math.ceil(totalProducts / limit) || 1;

    // We already fetched activeCategories earlier, but we need full objects for the view
    const categories = await Category.find({ isActive: true });

    res.render("user/home", {
      products,
      currentPage: Number(page),
      totalPages,
      query: req.query,
      categories
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export default { homePage };
