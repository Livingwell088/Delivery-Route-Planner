const freeze = (value) => Object.freeze(value);

export const RECEIPT_SCAN_STATUS = freeze({ IDLE: 'idle', PROCESSING: 'processing', SUCCEEDED: 'succeeded', FAILED: 'failed' });
export const RECEIPT_SCAN_ERROR_CODE = freeze({
  CAPTURE_FAILED: 'capture_failed', INVALID_IMAGE: 'invalid_image', RECOGNITION_FAILED: 'recognition_failed',
  NO_TEXT_FOUND: 'no_text_found', INSUFFICIENT_DATA: 'insufficient_data', UNKNOWN: 'unknown',
});
export const CONFIDENCE_LEVEL = freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  return value;
}

function finiteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number.`);
  return value;
}

function normalizeConfidence(confidence) {
  return typeof confidence === 'number'
    ? createConfidence(confidence)
    : createConfidence(confidence?.value, confidence?.evidence);
}

function optionalConfidence(confidence) {
  return confidence == null ? null : normalizeConfidence(confidence);
}

/** Creates a normalized confidence value independent of any OCR provider. */
export function createConfidence(value, evidence = []) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('Confidence value must be between 0 and 1.');
  }
  if (!Array.isArray(evidence) || evidence.some((item) => typeof item !== 'string')) {
    throw new TypeError('Confidence evidence must be an array of strings.');
  }
  const level = value >= 0.8 ? CONFIDENCE_LEVEL.HIGH : value >= 0.5 ? CONFIDENCE_LEVEL.MEDIUM : CONFIDENCE_LEVEL.LOW;
  return freeze({ value, level, evidence: freeze([...evidence]) });
}

/** Source-image pixel bounds with an origin at the top-left corner. */
export function createBoundingBox({ x, y, width, height }) {
  return freeze({
    x: finiteNonNegative(x, 'x'), y: finiteNonNegative(y, 'y'),
    width: finiteNonNegative(width, 'width'), height: finiteNonNegative(height, 'height'),
  });
}

export function createImageSize({ width, height }) {
  const size = createBoundingBox({ x: 0, y: 0, width, height });
  if (size.width === 0 || size.height === 0) throw new RangeError('Image dimensions must be greater than zero.');
  return freeze({ width: size.width, height: size.height });
}

export function createOCRTextLine({ id, text, boundingBox, confidence = null }) {
  return freeze({
    id: requiredString(id, 'OCR line id'), text: requiredString(text, 'OCR line text'),
    boundingBox: createBoundingBox(boundingBox), confidence: optionalConfidence(confidence),
  });
}

export function createOCRTextBlock({ id, text, boundingBox, lines = [], confidence = null }) {
  if (!Array.isArray(lines)) throw new TypeError('OCR block lines must be an array.');
  return freeze({
    id: requiredString(id, 'OCR block id'), text: requiredString(text, 'OCR block text'),
    boundingBox: createBoundingBox(boundingBox), lines: freeze(lines.map(createOCRTextLine)),
    confidence: optionalConfidence(confidence),
  });
}

export function createAddressCandidate({ id, streetAddress, city, state, postalCode, sourceLineIds = [], confidence }) {
  if (!Array.isArray(sourceLineIds)) throw new TypeError('Address sourceLineIds must be an array.');
  return freeze({
    id: requiredString(id, 'Address candidate id'), streetAddress: requiredString(streetAddress, 'Street address'),
    city: requiredString(city, 'City'), state: requiredString(state, 'State'),
    postalCode: requiredString(postalCode, 'Postal code'),
    sourceLineIds: freeze(sourceLineIds.map((lineId) => requiredString(lineId, 'Source line id'))),
    confidence: normalizeConfidence(confidence),
  });
}

export function createTimestampCandidate({ id, rawDate, rawTime, timestamp = null, sourceLineIds = [], confidence }) {
  if (!Array.isArray(sourceLineIds)) throw new TypeError('Timestamp sourceLineIds must be an array.');
  if (timestamp != null && Number.isNaN(new Date(timestamp).getTime())) {
    throw new TypeError('Timestamp must be null or a valid date value.');
  }
  return freeze({
    id: requiredString(id, 'Timestamp candidate id'), rawDate: requiredString(rawDate, 'Raw date'),
    rawTime: requiredString(rawTime, 'Raw time'), timestamp: timestamp == null ? null : new Date(timestamp).toISOString(),
    sourceLineIds: freeze(sourceLineIds.map((lineId) => requiredString(lineId, 'Source line id'))),
    confidence: normalizeConfidence(confidence),
  });
}

export function createReceiptScanResult({
  recognizedText, imageSize, blocks = [], addressCandidates = [], timestampCandidates = [],
  selectedAddressCandidateId = null, selectedTimestampCandidateId = null, confidence,
}) {
  if (![blocks, addressCandidates, timestampCandidates].every(Array.isArray)) {
    throw new TypeError('Receipt scan result collections must be arrays.');
  }
  const result = {
    recognizedText: requiredString(recognizedText, 'Recognized text'), imageSize: createImageSize(imageSize),
    blocks: freeze(blocks.map(createOCRTextBlock)), addressCandidates: freeze(addressCandidates.map(createAddressCandidate)),
    timestampCandidates: freeze(timestampCandidates.map(createTimestampCandidate)),
    selectedAddressCandidateId, selectedTimestampCandidateId, confidence: normalizeConfidence(confidence),
  };
  const hasAddress = selectedAddressCandidateId == null || result.addressCandidates.some(({ id }) => id === selectedAddressCandidateId);
  const hasTimestamp = selectedTimestampCandidateId == null || result.timestampCandidates.some(({ id }) => id === selectedTimestampCandidateId);
  if (!hasAddress || !hasTimestamp) throw new RangeError('Selected candidate ids must reference candidates in the result.');
  return freeze(result);
}

export function createReceiptScanError({ code = RECEIPT_SCAN_ERROR_CODE.UNKNOWN, message, cause = null }) {
  if (!Object.values(RECEIPT_SCAN_ERROR_CODE).includes(code)) throw new RangeError(`Unsupported receipt scan error code: ${code}`);
  return freeze({ code, message: requiredString(message, 'Error message'), cause });
}

export function createReceiptScanState({ status = RECEIPT_SCAN_STATUS.IDLE, result = null, error = null } = {}) {
  if (!Object.values(RECEIPT_SCAN_STATUS).includes(status)) throw new RangeError(`Unsupported receipt scan status: ${status}`);
  if (status === RECEIPT_SCAN_STATUS.SUCCEEDED && result == null) throw new TypeError('A succeeded scan state requires a result.');
  if (status === RECEIPT_SCAN_STATUS.FAILED && error == null) throw new TypeError('A failed scan state requires an error.');
  if (status !== RECEIPT_SCAN_STATUS.SUCCEEDED && result != null) throw new TypeError('Only a succeeded scan state may contain a result.');
  if (status !== RECEIPT_SCAN_STATUS.FAILED && error != null) throw new TypeError('Only a failed scan state may contain an error.');
  return freeze({ status, result, error });
}
