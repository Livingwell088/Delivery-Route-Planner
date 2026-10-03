import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';

import {
  RECEIPT_SCAN_ERROR_CODE,
  createOCRTextBlock,
  createReceiptScanError,
  createReceiptScanResult,
} from '../domain/receiptScan';
import { extractAddressCandidates } from './receiptAddressParser';

function frameToBoundingBox(frame) {
  if (!frame) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Math.max(0, frame.left),
    y: Math.max(0, frame.top),
    width: Math.max(0, frame.right - frame.left),
    height: Math.max(0, frame.bottom - frame.top),
  };
}

export function mapMLKitResult(ocrResult, imageSize) {
  if (!ocrResult?.text?.trim()) {
    throw createReceiptScanError({
      code: RECEIPT_SCAN_ERROR_CODE.NO_TEXT_FOUND,
      message: 'No readable text was found. Try again with better lighting and focus.',
    });
  }

  const blocks = (ocrResult.blocks ?? []).map((block, blockIndex) => createOCRTextBlock({
    id: `block-${blockIndex}`,
    text: block.text,
    boundingBox: frameToBoundingBox(block.frame),
    lines: (block.lines ?? []).map((line, lineIndex) => ({
      id: `block-${blockIndex}-line-${lineIndex}`,
      text: line.text,
      boundingBox: frameToBoundingBox(line.frame),
    })),
  }));
  const addressCandidates = extractAddressCandidates(blocks, imageSize);

  return createReceiptScanResult({
    recognizedText: ocrResult.text,
    imageSize,
    blocks,
    addressCandidates,
    selectedAddressCandidateId: addressCandidates[0]?.id ?? null,
    confidence: null,
  });
}

export async function recognizeReceipt(image) {
  if (!image?.uri || !image.width || !image.height) {
    throw createReceiptScanError({
      code: RECEIPT_SCAN_ERROR_CODE.INVALID_IMAGE,
      message: 'The captured receipt image is invalid.',
    });
  }

  try {
    const ocrResult = await recognizeText(image.uri);
    return mapMLKitResult(ocrResult, { width: image.width, height: image.height });
  } catch (error) {
    if (error?.code === RECEIPT_SCAN_ERROR_CODE.NO_TEXT_FOUND) throw error;
    throw createReceiptScanError({
      code: RECEIPT_SCAN_ERROR_CODE.RECOGNITION_FAILED,
      message: error instanceof Error ? error.message : 'Receipt text recognition failed.',
      cause: error,
    });
  }
}
