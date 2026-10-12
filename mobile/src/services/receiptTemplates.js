import { hasLineGeometry, receiptLines } from './receiptLines.js';

// Standard, alternate and boxed fixture variants share these textual anchors.
// No merchant address, ZIP or destination is supplied by a template.
export const RECEIPT_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'ming-house-delivery-v1', merchant: /^Ming\s+House$/i,
    delivery: /^Delivery(?:\s|$)/i, server: /^Server\s*:/i }),
]);

export function matchReceiptTemplate(blocks) {
  const lines = receiptLines(blocks);
  if (!lines.every(hasLineGeometry)) return null;
  for (const template of RECEIPT_TEMPLATES) {
    const merchantIndex = lines.findIndex((line) => template.merchant.test(line.cleanedText));
    const deliveryIndex = lines.findIndex((line, index) => index > merchantIndex
      && template.delivery.test(line.cleanedText) && !/^Delivery\s+Charge/i.test(line.cleanedText));
    const serverIndex = lines.findIndex((line, index) => index > deliveryIndex
      && template.server.test(line.cleanedText));
    if (merchantIndex < 0 || deliveryIndex <= merchantIndex || serverIndex <= deliveryIndex) continue;
    if (deliveryIndex - merchantIndex > 6 || serverIndex - deliveryIndex > 6) continue;
    const server = lines[serverIndex];
    const addressLines = lines.slice(serverIndex + 1).filter((line) => {
      const a = server.boundingBox;
      const b = line.boundingBox;
      return b.y > a.y && b.y - a.y <= Math.max(a.height, b.height) * 6
        && Math.abs(a.x - b.x) <= Math.max(a.height, b.height) * 1.5;
    }).slice(0, 3);
    return { id: template.id,
      addressLineIds: addressLines.map((line) => line.id),
      timestampLineIds: lines.slice(deliveryIndex + 1, serverIndex).map((line) => line.id),
      headerLineIds: lines.slice(0, deliveryIndex).map((line) => line.id) };
  }
  return null;
}

/** Keep every generic candidate; template evidence adjusts ranking, not fields. */
export function applyReceiptTemplate(candidates, match, kind) {
  if (!match) return candidates;
  const targetIds = kind === 'address' ? match.addressLineIds : match.timestampLineIds;
  return candidates.map((candidate) => {
    const supported = candidate.sourceLineIds.every((id) => targetIds.includes(id));
    const header = kind === 'address' && candidate.sourceLineIds.some((id) => match.headerLineIds.includes(id));
    const outsideTimeRegion = kind === 'timestamp' && !supported;
    if (!supported && !header && !outsideTimeRegion) return candidate;
    return { ...candidate, confidence: {
      value: Math.max(0, candidate.confidence.value - (header ? 0.25 : outsideTimeRegion ? 0.12 : 0)),
      evidence: [...candidate.confidence.evidence,
        `${match.id}: ${header ? 'merchant header address' : outsideTimeRegion
          ? 'timestamp outside expected order region' : `${kind} in expected delivery region`}`],
    } };
  }).sort((a, b) => b.confidence.value - a.confidence.value);
}
