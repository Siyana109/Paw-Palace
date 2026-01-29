import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
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
      page = 1,
      petType
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

    const petTypes = [].concat(req.query.petType || []);

if (petTypes.length > 0) {
  productMatch.petType = { $in: petTypes };
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
          createdAt: { $first: "$createdAt" },
          petType: { $first: "$petType" }
        }
      },

      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit }
    ];

    const products = await Product.aggregate(pipeline);

    /* ------------------ COUNT FOR PAGINATION ------------------ */
    // Optimization: separate count query might be faster/simpler than reusing aggregation if no complex groups needed, 
    // but here we filter on variants price so we need similar pipeline or just rely on reused pipeline without skip/limit.
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
      {
        $group: {
          _id: "$_id"
        }
      }
    ];

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult.length;
    const totalPages = Math.ceil(totalProducts / limit);

    /* ------------------ FETCH CATEGORIES ------------------ */
    // We need category names for the sidebar
    // Assuming Category model exists and is imported. Wait, I need to check imports.
    // I need to import Category if not already there, but I can't see top of file here.
    // I'll assume I might need to add it, but for now I'm replacing the function.
    // I will add the import in a separate call if needed or just use mongoose.model if lazy, but best to do it right.
    // Let's assume I need to import it. I'll do a MultiReplace or two steps if I can't see the top. 
    // Wait, I saw the top in view_file. It had Variant, Product, mongoose. 
    // I need to import Category.

    // I will write the function first. I will assume 'Category' is available or I will use mongoose.model('Category') inside.
    const categories = await Category.find({ isActive: true });


    /* ------------------ RESPONSE ------------------ */
    res.render("user/home", {
      products,
      currentPage: Number(page),
      totalPages,
      query: req.query,
      categories // Pass categories to view
    });
console.log("RAW petType:", req.query.petType);
console.log("MATCH:", productMatch);


  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

export default { homePage };
