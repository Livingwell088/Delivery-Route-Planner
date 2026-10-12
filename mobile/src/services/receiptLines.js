export function cleanReceiptText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function hasLineGeometry(line) {
  return line.boundingBox?.width > 0 && line.boundingBox?.height > 0;
}

/** Preserve block identity; derived lines have no trustworthy individual geometry. */
export function receiptLines(blocks) {
  const lines = blocks.flatMap((block) => {
    const source = block.lines.length ? block.lines : block.text.split(/\r?\n/)
      .filter((text) => text.trim()).map((text, index) => ({
        id: `${block.id}-derived-${index}`, text,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      }));
    return source.map((line) => ({ ...line, blockId: block.id,
      cleanedText: cleanReceiptText(line.text) }));
  }).filter((line) => line.cleanedText);
  // Preserve OCR order if any coordinates are missing; never pretend zero bounds
  // place an unlocated line at the top of the receipt.
  if (!lines.every(hasLineGeometry)) return lines;
  return lines.sort((a, b) => a.boundingBox.y - b.boundingBox.y
    || a.boundingBox.x - b.boundingBox.x || a.id.localeCompare(b.id));
}

/** Scale-independent neighborhood, with a conservative same-block text fallback. */
export function relatedFollowingLine(anchor, line, maxLineHeights = 3) {
  if (!hasLineGeometry(anchor) || !hasLineGeometry(line)) {
    return anchor.blockId === line.blockId;
  }
  const a = anchor.boundingBox;
  const b = line.boundingBox;
  const height = Math.max(a.height, b.height);
  return b.y > a.y + height * 0.2 && b.y - a.y <= height * maxLineHeights
    && Math.abs(a.x - b.x) <= height * 1.5;
}
