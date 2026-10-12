import { extractAddressCandidates } from './receiptAddressParser.js';
import { extractTimestampCandidates } from './receiptTimestampParser.js';
import { applyReceiptTemplate, matchReceiptTemplate } from './receiptTemplates.js';

/** Provider-independent deterministic parsing, including unknown-layout fallback. */
export function parseReceiptCandidates(blocks, imageSize) {
  const match = matchReceiptTemplate(blocks);
  return {
    addressCandidates: applyReceiptTemplate(extractAddressCandidates(blocks, imageSize), match, 'address'),
    timestampCandidates: applyReceiptTemplate(extractTimestampCandidates(blocks), match, 'timestamp'),
    templateId: match?.id ?? null,
  };
}
