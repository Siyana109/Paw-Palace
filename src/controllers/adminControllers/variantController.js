import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";


//   DELETE VARIANT
const deleteVariant = async (req, res) => {
  await Variant.findByIdAndDelete(req.params.variantId);
  res.status(200).json({ success: true });
};



export default { deleteVariant }