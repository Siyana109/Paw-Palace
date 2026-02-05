import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import Offer from "../../model/offerModel.js";

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

    // PRODUCT MATCH
    const productMatch = { isActive: true };

    if (search) {
      productMatch.productName = { $regex: search, $options: "i" };
    }

    if (category) {
      productMatch.categoryId = new mongoose.Types.ObjectId(category);
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

      {
        $group: {
          _id: "$_id",
          name: { $first: "$productName" },
          category: { $first: "$categoryId" },
          image: { $first: "$variants.coverImage" },
          price: { $min: "$variants.price" },
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

    products = products.map(product => {

      // 1️⃣ Product-level offer
      const productOffer = activeOffers.find(o =>
        o.offerType === "product" &&
        o.productId.some(id => id.toString() === product._id.toString())
      );

      // 2️⃣ Category-level offer (ONLY if no product offer)
      const categoryOffer = !productOffer
        ? activeOffers.find(o =>
          o.offerType === "category" &&
          o.categoryId?.toString() === product.category?.toString()
        )
        : null;

      const appliedOffer = productOffer || categoryOffer;

      if (!appliedOffer) {
        return { ...product, offerApplied: false };
      }

      let offerPrice =
        appliedOffer.discountType === "percentage"
          ? product.price - (product.price * appliedOffer.discount) / 100
          : product.price - appliedOffer.discount;

      return {
        ...product,
        offerApplied: true,
        offerDiscountVal: appliedOffer.discount,
        offerDiscountType: appliedOffer.discountType,
        offerPrice: Math.max(offerPrice, 0)
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
    const totalPages = Math.ceil(totalProducts / limit);

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
