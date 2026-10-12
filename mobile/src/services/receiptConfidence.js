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
  selectedAddressCandidateId = addressCandidates[0]?.id,
  selectedTimestampCandidateId = timestampCandidates[0]?.id }) {
  const evidence = [];
  const address = addressCandidates.find(({ id }) => id === selectedAddressCandidateId);
  const timestamp = timestampCandidates.find(({ id }) => id === selectedTimestampCandidateId);
  evidence.push(address ? 'complete delivery address detected' : 'complete delivery address missing');
  evidence.push(timestamp ? 'complete order timestamp detected' : 'complete order timestamp missing');
  evidence.push(...(address?.confidence?.evidence ?? []), ...(timestamp?.confidence?.evidence ?? []));
  const addressAmbiguous = ambiguity(addressCandidates, address, 'address', evidence);
  const timeAmbiguous = ambiguity(timestampCandidates, timestamp, 'timestamp', evidence);
  let value = Math.min(score(address), score(timestamp));
  value -= (addressAmbiguous ? 0.08 : 0) + (timeAmbiguous ? 0.08 : 0);
  if (addressAmbiguous || timeAmbiguous) value = Math.min(value, 0.89);
  return createConfidence(Math.max(0, value), [...new Set(evidence)]);
}

export function assessReceiptScan(result) {
  const addresses = result?.addressCandidates ?? [];
  const timestamps = result?.timestampCandidates ?? [];
  const confidence = calculateReceiptConfidence({ addressCandidates: addresses, timestampCandidates: timestamps,
    selectedAddressCandidateId: result?.selectedAddressCandidateId ?? null,
    selectedTimestampCandidateId: result?.selectedTimestampCandidateId ?? null });
  const address = addresses.find(({ id }) => id === result?.selectedAddressCandidateId);
  const timestamp = timestamps.find(({ id }) => id === result?.selectedTimestampCandidateId);
  const completeAddress = ['streetAddress', 'city', 'state', 'postalCode'].every((field) =>
    typeof address?.[field] === 'string' && address[field].trim());
  const validTime = Boolean(timestamp?.timestamp) && !Number.isNaN(new Date(timestamp.timestamp).getTime());
  const reasons = [...confidence.evidence];
  if (!completeAddress) reasons.push('Select or correct a complete delivery address.');
  if (!validTime) reasons.push('Select or correct a valid order date and time.');
  if (score(address) < 0.7) reasons.push('Delivery address confidence is too low.');
  if (score(timestamp) < 0.7) reasons.push('Order time confidence is too low.');
  return { confidence, reasons: [...new Set(reasons)], action: completeAddress && validTime
    ? receiptConfidenceAction(confidence.value) : RECEIPT_ACTION.CORRECT };
}

export function isReceiptScanUsable(result) {
  return assessReceiptScan(result).action !== RECEIPT_ACTION.CORRECT;
}
