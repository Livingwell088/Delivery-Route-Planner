import { createOrderNumberCandidate } from '../domain/receiptScan.js';
import { hasLineGeometry, receiptLines } from './receiptLines.js';

const LABEL_PATTERN = /\bORDER\s*(?:(?:NUMBER|NO\.?)\s*[:#]?|[:#])?\s*(\d{1,8})(?![\d./:-])\b/i;
const DATE_PATTERN = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;

/** Prefer explicit labels; Ming House prints a large number to the right of the date. */
export function extractOrderNumberCandidates(blocks, imageSize) {
  const lines = receiptLines(blocks);
  const merchant = lines.find((line) => /^Ming\s+House$/i.test(line.cleanedText));
  const dates = lines.filter((line) => DATE_PATTERN.test(line.cleanedText) && hasLineGeometry(line));
  const candidates = new Map();
  for (const line of lines) {
    const labeled = line.cleanedText.match(LABEL_PATTERN);
    const bare = line.cleanedText.match(/^\d{1,6}$/);
    let orderNumber = labeled?.[1];
    let confidence = { value: 0.94, evidence: ['printed order number label detected'] };
    if (!orderNumber && merchant && bare && hasLineGeometry(line)) {
      const box = line.boundingBox;
      // Locate the number relative to the printed header, independent of photo framing.
      const nearDate = dates.some(({ boundingBox: date }) =>
        (!hasLineGeometry(merchant) || date.y > merchant.boundingBox.y)
        && box.height >= date.height * 0.8 && box.x >= date.x + date.width - date.height
        && box.x - date.x - date.width <= date.height * 20
        && Math.abs(box.y + box.height / 2 - date.y - date.height / 2) <= box.height * 1.5);
      if (nearDate) {
        orderNumber = bare[0];
        confidence = { value: 0.86, evidence: ['prominent order number beside date in known receipt header'] };
      }
    }
    if (!orderNumber) continue;
    const previous = candidates.get(orderNumber);
    const candidate = { id: `order-${line.id}`, orderNumber,
      sourceLineIds: [...new Set([...(previous?.sourceLineIds ?? []), line.id])], confidence };
    if (previous && previous.confidence.value > confidence.value) {
      candidate.id = previous.id;
      candidate.confidence = previous.confidence;
    }
    candidates.set(orderNumber, candidate);
  }
  return [...candidates.values()].sort((a, b) => b.confidence.value - a.confidence.value)
    .map(createOrderNumberCandidate);
}

export function selectOrderNumberCandidate(candidates) {
  if (!candidates.length || candidates[0].confidence.value < 0.7) return null;
  if (candidates[1] && candidates[0].confidence.value - candidates[1].confidence.value < 0.1) return null;
  return candidates[0].id;
}
