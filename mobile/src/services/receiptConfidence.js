import { createConfidence } from '../domain/receiptScan.js';

export const USABLE_RECEIPT_CONFIDENCE = 0.7;
export const RECEIPT_ACTION = Object.freeze({ ACCEPT: 'accept', CONFIRM: 'confirm', CORRECT: 'correct' });

export function receiptConfidenceAction(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) return RECEIPT_ACTION.CORRECT;
  return value >= 0.9 ? RECEIPT_ACTION.ACCEPT : value >= 0.7 ? RECEIPT_ACTION.CONFIRM : RECEIPT_ACTION.CORRECT;
}

function score(candidate) {
  const value = candidate?.confidence?.value;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

function ambiguity(candidates, selected, label, evidence) {
  if (!selected || !candidates.some((candidate) => candidate.id !== selected.id
    && score(selected) - score(candidate) < 0.1 - Number.EPSILON)) return false;
  evidence.push(`${label} matches are similarly ranked`);
  return true;
}

/** The weakest required field limits confidence; rounding never changes policy. */
export function calculateReceiptConfidence({ addressCandidates, timestampCandidates,
  orderNumberCandidates,
  selectedOrderNumberCandidateId = orderNumberCandidates?.[0]?.id,
  selectedAddressCandidateId = addressCandidates[0]?.id,
  selectedTimestampCandidateId = timestampCandidates[0]?.id }) {
  const evidence = [];
  const address = addressCandidates.find(({ id }) => id === selectedAddressCandidateId);
  const timestamp = timestampCandidates.find(({ id }) => id === selectedTimestampCandidateId);
  const requiresOrderNumber = Array.isArray(orderNumberCandidates);
  const orderNumber = orderNumberCandidates?.find(({ id }) => id === selectedOrderNumberCandidateId);
  evidence.push(address ? 'complete delivery address detected' : 'complete delivery address missing');
  evidence.push(timestamp ? 'complete order timestamp detected' : 'complete order timestamp missing');
  evidence.push(...(address?.confidence?.evidence ?? []), ...(timestamp?.confidence?.evidence ?? []));
  if (requiresOrderNumber) {
    evidence.push(orderNumber ? 'printed order number detected' : 'printed order number missing or ambiguous');
    evidence.push(...(orderNumber?.confidence?.evidence ?? []));
  }
  const addressAmbiguous = ambiguity(addressCandidates, address, 'address', evidence);
  const timeAmbiguous = ambiguity(timestampCandidates, timestamp, 'timestamp', evidence);
  const orderAmbiguous = requiresOrderNumber && ambiguity(orderNumberCandidates, orderNumber, 'order number', evidence);
  let value = Math.min(score(address), score(timestamp), requiresOrderNumber ? score(orderNumber) : 1);
  value -= (addressAmbiguous ? 0.08 : 0) + (timeAmbiguous ? 0.08 : 0) + (orderAmbiguous ? 0.08 : 0);
  if (addressAmbiguous || timeAmbiguous || orderAmbiguous) value = Math.min(value, 0.89);
  return createConfidence(Math.max(0, value), [...new Set(evidence)]);
}

export function assessReceiptScan(result) {
  const addresses = result?.addressCandidates ?? [];
  const timestamps = result?.timestampCandidates ?? [];
  const confidence = calculateReceiptConfidence({ addressCandidates: addresses, timestampCandidates: timestamps,
    orderNumberCandidates: result?.orderNumberCandidates,
    selectedOrderNumberCandidateId: result?.selectedOrderNumberCandidateId ?? null,
    selectedAddressCandidateId: result?.selectedAddressCandidateId ?? null,
    selectedTimestampCandidateId: result?.selectedTimestampCandidateId ?? null });
  const address = addresses.find(({ id }) => id === result?.selectedAddressCandidateId);
  const timestamp = timestamps.find(({ id }) => id === result?.selectedTimestampCandidateId);
  const orderNumber = result?.orderNumberCandidates?.find(({ id }) => id === result?.selectedOrderNumberCandidateId);
  const validOrderNumber = !Array.isArray(result?.orderNumberCandidates) || Boolean(orderNumber?.orderNumber?.trim());
  const completeAddress = ['streetAddress', 'city', 'state', 'postalCode'].every((field) =>
    typeof address?.[field] === 'string' && address[field].trim());
  const validTime = Boolean(timestamp?.timestamp) && !Number.isNaN(new Date(timestamp.timestamp).getTime());
  const reasons = [...confidence.evidence];
  if (!completeAddress) reasons.push('Select or correct a complete delivery address.');
  if (!validTime) reasons.push('Select or correct a valid order date and time.');
  if (!validOrderNumber) reasons.push('Select or correct the printed order number.');
  if (score(address) < 0.7) reasons.push('Delivery address confidence is too low.');
  if (score(timestamp) < 0.7) reasons.push('Order time confidence is too low.');
  return { confidence, reasons: [...new Set(reasons)], action: completeAddress && validTime && validOrderNumber
    ? receiptConfidenceAction(confidence.value) : RECEIPT_ACTION.CORRECT };
}

export function isReceiptScanUsable(result) {
  return assessReceiptScan(result).action !== RECEIPT_ACTION.CORRECT;
}

/** Translate relevant uncertainty into driver-facing warnings, retaining full evidence internally. */
export function receiptReviewWarnings(review) {
  const warnings = [];
  for (const reason of review?.reasons ?? []) {
    if (reason.startsWith('Select or correct') || reason.endsWith('confidence is too low.')) warnings.push(reason);
    else if (reason === 'address matches are similarly ranked') warnings.push('Several destinations look plausible. Choose and verify the delivery address.');
    else if (reason === 'timestamp matches are similarly ranked') warnings.push('Several times look plausible. Choose and verify the placed time.');
    else if (reason === 'order number matches are similarly ranked') warnings.push('Several order numbers look plausible. Choose the one printed on the receipt.');
    else if (reason.includes('geometry unavailable')) warnings.push('The receipt layout could not be read reliably. Verify all details.');
    else if (reason.includes('inferred from ZIP')) warnings.push('The state was inferred from the ZIP. Verify it against the receipt.');
    else if (reason.includes('payment or reprint timestamp') || reason.includes('timestamp outside expected')) warnings.push('This may be a payment or reprint time. Verify the placed time.');
    else if (reason.includes(': merchant header address')) warnings.push('This may be the restaurant address. Verify the delivery destination.');
  }
  return [...new Set(warnings)];
}
