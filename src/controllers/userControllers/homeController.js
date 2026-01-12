import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";
import mongoose from "mongoose";

const homePage = async (req, res) => {
  try {
    /* ------------------ QUERY PARAMS ------------------ */
    const {
      search = "",
      category,
      minPrice,
      maxPrice,
      sort = "featured",
      page = 1
    } = req.query;

    const limit = 6;
    const skip = (page - 1) * limit;

    /* ------------------ PRODUCT MATCH ------------------ */
    const productMatch = {
      isActive: true
    };

    if (search) {
      productMatch.productName = {
        $regex: search,
        $options: "i"
      };
    }

    if (category) {
      productMatch.categoryId = new mongoose.Types.ObjectId(category);
    }

    /* ------------------ SORT LOGIC ------------------ */
    let sortStage = {};

    switch (sort) {
      case "price_asc":
        sortStage = { price: 1 };
        break;
      case "price_desc":
        sortStage = { price: -1 };
        break;
      case "name_asc":
        sortStage = { name: 1 };
        break;
      case "name_desc":
        sortStage = { name: -1 };
        break;
      default:
        sortStage = { createdAt: -1 };
    }

    /* ------------------ AGGREGATION ------------------ */
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

      /* Price Filter */
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

      /* Group per product */
      {
        $group: {
          _id: "$_id",
          name: { $first: "$productName" },
          category: { $first: "$categoryId" },
          image: { $first: "$variants.coverImage" },
          price: { $min: "$variants.price" },
          createdAt: { $first: "$createdAt" }
        }
      },

      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit }
    ];

    const products = await Product.aggregate(pipeline);

    /* ------------------ COUNT FOR PAGINATION ------------------ */
    const countPipeline = [...pipeline];
    countPipeline.splice(-3); // remove skip & limit

    const totalProducts = await Product.aggregate(countPipeline);

    const totalPages = Math.ceil(totalProducts.length / limit);

    /* ------------------ RESPONSE ------------------ */
    res.render("user/home", {
      products,
      currentPage: Number(page),
      totalPages,
      query: req.query
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

export default { homePage };
