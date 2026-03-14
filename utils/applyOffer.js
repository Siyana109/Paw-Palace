export const applyOfferToPrice = ({ price, productId, categoryId, activeOffers }) => {
  // Product offer
  const productOffer = activeOffers.find(o =>
    o.offerType === "product" &&
    o.productId.some(id => id.toString() === productId.toString())
  );

  const normalizedCategoryId = categoryId?._id || categoryId;

  // Category offer (only if no product offer)
  const categoryOffer = !productOffer
    ? activeOffers.find(o =>
      o.offerType === "category" &&
      normalizedCategoryId && o.categoryId?.toString() === normalizedCategoryId?.toString()
    )
    : null;

  const appliedOffer = productOffer || categoryOffer;

  if (!appliedOffer) {
    return {
      offerApplied: false,
      finalPrice: price
    };
  }

  let finalPrice = price - (price * appliedOffer.discount) / 100;
  finalPrice = Math.round(finalPrice * 100) / 100;

  return {
    offerApplied: true,
    finalPrice: Math.max(finalPrice, 0),
    discountType: appliedOffer.discountType,
    discountValue: appliedOffer.discount
  };
};
