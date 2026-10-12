import { assessReceiptScan } from './receiptConfidence.js';

function selectedCandidate(candidates, selectedId) {
  return candidates.find(({ id }) => id === selectedId) ?? null;
}

/** Maps the supported OCR fields into the existing editable order confirmation model. */
export function createOrderDraftFromReceipt(result, orderId = '', { allowCorrection = false } = {}) {
  const address = selectedCandidate(result.addressCandidates, result.selectedAddressCandidateId);
  const timestamp = selectedCandidate(result.timestampCandidates, result.selectedTimestampCandidateId);
  const orderNumber = selectedCandidate(result.orderNumberCandidates ?? [], result.selectedOrderNumberCandidateId);
  const printedOrderId = orderNumber?.orderNumber ?? orderId;
  if ((!address || !timestamp?.timestamp) && !allowCorrection) {
    throw new TypeError('A selected address and timestamp are required to create an order draft.');
  }

  const formattedAddress = address ? `${address.streetAddress}, ${address.city}, ${address.state} ${address.postalCode}` : '';
  const placedAt = timestamp?.timestamp ?? '';
  const assessment = assessReceiptScan(result);
  return {
    order_id: printedOrderId,
    address: {
      formatted_address: formattedAddress,
      coordinates: null,
    },
    placedAt,
    source: 'receipt-ocr',
    ...(allowCorrection ? { receiptReview: {
      action: assessment.action, confidence: assessment.confidence, reasons: assessment.reasons,
      originalAddress: formattedAddress, originalTime: placedAt,
      originalOrderNumber: printedOrderId,
      orderNumberNeedsCorrection: Boolean(orderNumber) && orderNumber.confidence.value < 0.7,
      addressNeedsCorrection: !address || (address.confidence?.value ?? 0) < 0.7,
      timeNeedsCorrection: !timestamp || (timestamp.confidence?.value ?? 0) < 0.7,
    } } : {}),
  };
}


export function createManualReceiptDraft(orderId = '') {
  return createOrderDraftFromReceipt({ addressCandidates: [], timestampCandidates: [],
    selectedAddressCandidateId: null, selectedTimestampCandidateId: null }, orderId, { allowCorrection: true });
}

function validReceiptTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || Number.isNaN(new Date(value).getTime())) return false;
  const [, year, month, day, hour, minute] = match.map((part, index) => index ? Number(part) : part);
  const second = Number(match[6] ?? 0);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day && hour < 24 && minute < 60 && second < 60;
}

/** Validate review resolution independently of UI button state. */
export function validateReceiptDraft(draft) {
  if (draft?.source === 'receipt-ocr' && !draft.order_id?.trim()) return 'Enter the order number printed on the receipt.';
  if (!draft?.order_id?.trim() || !draft.address?.formatted_address?.trim()
    || !draft.placedAt || Number.isNaN(new Date(draft.placedAt).getTime())) {
    return 'Enter an order number, address, and valid placed time.';
  }
  if (draft.source !== 'receipt-ocr') return null;
  if (!validReceiptTimestamp(draft.placedAt)) return 'Enter a valid ISO placed time with timezone, such as 2026-08-29T16:12:00-04:00.';
  const review = draft.receiptReview;
  if (!review) return 'Receipt review is missing. Rescan or enter the receipt manually.';
  // Require a street/house number, city and explicit state; ZIP may be absent
  // with the final Confirm and add order action confirming the destination.
  if (!/^\d[\s\S]+,\s*[A-Za-z][A-Za-z .'-]*,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/.test(draft.address.formatted_address.trim())) {
    return 'Enter the full destination as street and unit, city, state, and ZIP if available.';
  }
  const normalize = (value) => value.trim().replace(/\s+/g, ' ').toUpperCase();
  const addressChanged = normalize(draft.address.formatted_address) !== normalize(review.originalAddress);
  const timeChanged = new Date(draft.placedAt).getTime() !== new Date(review.originalTime).getTime();
  const orderNumberChanged = normalize(draft.order_id) !== normalize(review.originalOrderNumber ?? '');
  if (review.orderNumberNeedsCorrection && !orderNumberChanged) return 'Correct the uncertain order number or rescan.';
  if (review.addressNeedsCorrection && !addressChanged) return 'Correct the uncertain delivery address or rescan.';
  if (review.timeNeedsCorrection && !timeChanged) return 'Correct the uncertain order time or rescan.';
  if (review.action === 'correct' && !addressChanged && !timeChanged && !orderNumberChanged) return 'Correct the uncertain receipt information or rescan.';
  return null;
}
