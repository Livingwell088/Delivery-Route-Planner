import { createConfidence } from '../domain/receiptScan.js';

export const USABLE_RECEIPT_CONFIDENCE = 0.7;

function ambiguityPenalty(candidates, label, evidence) {
  if (candidates.length < 2) return 0;
  const difference = candidates[0].confidence.value - candidates[1].confidence.value;
  if (difference >= 0.1) return 0;
  evidence.push(`${label} matches are similarly ranked`);
  return 0.08;
}

/** Combines parser confidence into a single score for the fields RouteRunner needs. */
export function calculateReceiptConfidence({ addressCandidates, timestampCandidates }) {
  const evidence = [];
  const address = addressCandidates[0] ?? null;
  const timestamp = timestampCandidates[0] ?? null;

  if (address) evidence.push('complete delivery address detected');
  else evidence.push('complete delivery address missing');

  if (timestamp) evidence.push('complete order timestamp detected');
  else evidence.push('complete order timestamp missing');

  let value = (address?.confidence.value ?? 0) * 0.65
    + (timestamp?.confidence.value ?? 0) * 0.35;
  value -= ambiguityPenalty(addressCandidates, 'address', evidence);
  value -= ambiguityPenalty(timestampCandidates, 'timestamp', evidence);

  return createConfidence(Math.max(0, Math.min(1, Number(value.toFixed(2)))), evidence);
}

export function isReceiptScanUsable(result) {
  return Boolean(
    result?.selectedAddressCandidateId
    && result?.selectedTimestampCandidateId
    && result?.confidence?.value >= USABLE_RECEIPT_CONFIDENCE,
  );
}
