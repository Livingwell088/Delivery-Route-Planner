import { assessReceiptScan } from './receiptConfidence.js';

function selectedCandidate(candidates, selectedId) {
  return candidates.find(({ id }) => id === selectedId) ?? null;
}

/** Maps the supported OCR fields into the existing editable order confirmation model. */
export function createOrderDraftFromReceipt(result, orderId, { allowCorrection = false } = {}) {
  const address = selectedCandidate(result.addressCandidates, result.selectedAddressCandidateId);
  const timestamp = selectedCandidate(result.timestampCandidates, result.selectedTimestampCandidateId);
  if ((!address || !timestamp?.timestamp) && !allowCorrection) {
    throw new TypeError('A selected address and timestamp are required to create an order draft.');
  }

  const formattedAddress = address ? `${address.streetAddress}, ${address.city}, ${address.state} ${address.postalCode}` : '';
  const placedAt = timestamp?.timestamp ?? '';
  const assessment = assessReceiptScan(result);
  return {
    order_id: orderId,
    address: {
      formatted_address: formattedAddress,
      coordinates: null,
    },
    placedAt,
    source: 'receipt-ocr',
    ...(allowCorrection ? { receiptReview: {
      action: assessment.action, confidence: assessment.confidence, reasons: assessment.reasons,
      originalAddress: formattedAddress, originalTime: placedAt,
      addressNeedsCorrection: !address || (address.confidence?.value ?? 0) < 0.7,
      timeNeedsCorrection: !timestamp || (timestamp.confidence?.value ?? 0) < 0.7,
      addressConfirmed: false, timeConfirmed: false,
    } } : {}),
  };
}


export function createManualReceiptDraft(orderId) {
  return createOrderDraftFromReceipt({ addressCandidates: [], timestampCandidates: [],
    selectedAddressCandidateId: null, selectedTimestampCandidateId: null }, orderId, { allowCorrection: true });
}

/** Validate review resolution independently of UI button state. */
export function validateReceiptDraft(draft) {
  if (!draft?.order_id?.trim() || !draft.address?.formatted_address?.trim()
    || !draft.placedAt || Number.isNaN(new Date(draft.placedAt).getTime())) {
    return 'Enter an order number, address, and valid placed time.';
  }
  if (draft.source !== 'receipt-ocr') return null;
  const review = draft.receiptReview;
  if (!review) return 'Receipt review is missing. Rescan or enter the receipt manually.';
  // Require a street/house number, city and explicit state; ZIP may be absent
  // only after the driver explicitly verifies the destination.
  if (!/^\d[\s\S]+,\s*[A-Za-z][A-Za-z .'-]*,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/.test(draft.address.formatted_address.trim())) {
    return 'Enter the full destination as street and unit, city, state, and ZIP if available.';
  }
  const normalize = (value) => value.trim().replace(/\s+/g, ' ').toUpperCase();
  const addressChanged = normalize(draft.address.formatted_address) !== normalize(review.originalAddress);
  const timeChanged = new Date(draft.placedAt).getTime() !== new Date(review.originalTime).getTime();
  if (review.addressNeedsCorrection && !addressChanged) return 'Correct the uncertain delivery address or rescan.';
  if (review.timeNeedsCorrection && !timeChanged) return 'Correct the uncertain order time or rescan.';
  if (review.action === 'correct' && !addressChanged && !timeChanged) return 'Correct the uncertain receipt information or rescan.';
  if (!review.addressConfirmed || !review.timeConfirmed) return 'Verify the destination and order time against the receipt.';
  return null;
}
