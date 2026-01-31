import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
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

    const limit = 6;
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
      case "price_asc": sortStage = { price: 1 }; break;
      case "price_desc": sortStage = { price: -1 }; break;
      case "name_asc": sortStage = { name: 1 }; break;
      case "name_desc": sortStage = { name: -1 }; break;
      default: sortStage = { createdAt: -1 };
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

          // STOCK CALCULATION
          totalStock: { $sum: "$variants.stock" }
        }
      },

      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit }
    ];

    let products = await Product.aggregate(pipeline);

    // ADD inStock FLAG
    products = products.map(p => ({
      ...p,
      inStock: p.totalStock > 0
    }));

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
