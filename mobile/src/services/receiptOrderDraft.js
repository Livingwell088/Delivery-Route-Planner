function selectedCandidate(candidates, selectedId) {
  return candidates.find(({ id }) => id === selectedId) ?? null;
}

/** Maps the supported OCR fields into the existing editable order confirmation model. */
export function createOrderDraftFromReceipt(result, orderId) {
  const address = selectedCandidate(result.addressCandidates, result.selectedAddressCandidateId);
  const timestamp = selectedCandidate(result.timestampCandidates, result.selectedTimestampCandidateId);
  if (!address || !timestamp?.timestamp) {
    throw new TypeError('A selected address and timestamp are required to create an order draft.');
  }

  return {
    order_id: orderId,
    address: {
      formatted_address: `${address.streetAddress}, ${address.city}, ${address.state} ${address.postalCode}`,
      coordinates: null,
    },
    placedAt: timestamp.timestamp,
    source: 'receipt-ocr',
  };
}
