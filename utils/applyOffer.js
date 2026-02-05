export const applyOfferToPrice = ({ price, productId, categoryId, activeOffers }) => {
  // 1️⃣ Product offer
  const productOffer = activeOffers.find(o =>
    o.offerType === "product" &&
    o.productId.some(id => id.toString() === productId.toString())
  );

  // 2️⃣ Category offer (only if no product offer)
  const categoryOffer = !productOffer
    ? activeOffers.find(o =>
        o.offerType === "category" &&
        o.categoryId?.toString() === categoryId.toString()
      )
    : null;

  const appliedOffer = productOffer || categoryOffer;

  if (!appliedOffer) {
    return {
      offerApplied: false,
      finalPrice: price
    };
  }

  let finalPrice =
    appliedOffer.discountType === "percentage"
      ? price - (price * appliedOffer.discount) / 100
      : price - appliedOffer.discount;

  return {
    offerApplied: true,
    finalPrice: Math.max(finalPrice, 0),
    discountType: appliedOffer.discountType,
    discountValue: appliedOffer.discount
  };
};
