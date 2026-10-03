import { createAddressCandidate } from '../domain/receiptScan.js';

const STREET_PATTERN = /^(\d{1,6}(?:[/-]\d{1,6})?[A-Z]?)\s+(.+?\b(?:ST(?:REET)?|AVE(?:NUE)?|RD|ROAD|DR(?:IVE)?|LN|LANE|BLVD|BOULEVARD|CT|COURT|CIR(?:CLE)?|HWY|HIGHWAY|PKWY|PARKWAY|PL(?:ACE)?|TER(?:RACE)?|WAY))\b(?:[,.]?\s*(.*))?$/i;
const CITY_STATE_ZIP_PATTERN = /^([A-Z][A-Z .'-]*?)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i;
const CITY_ZIP_PATTERN = /^([A-Z][A-Z .'-]*?)[,\s]+(\d{5}(?:-\d{4})?)$/i;
const UNIT_PATTERN = /^(#\s*[A-Z0-9-]+|(?:APT|APARTMENT|UNIT|STE|SUITE)\s*#?\s*[A-Z0-9-]+|(?:\d+(?:ST|ND|RD|TH)?\s*FL(?:OOR)?|FL(?:OOR)?\s*\d+))\b(?:[,\s]+(.*))?$/i;
const DELIVERY_LABEL_PATTERN = /\b(?:deliver(?:y|ing)|ship(?:ping)?|customer)\b/i;
const PHONE_PATTERN = /(?:tel|phone)|(?:\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})/i;

function cleanText(value) {
  return value
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return value.toLowerCase().replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function normalizeStreet(value) {
  return titleCase(cleanText(value))
    .replace(/\bSt(?:reet)?\b/i, 'St')
    .replace(/\bAve(?:nue)?\b/i, 'Ave')
    .replace(/\b(?:Rd|Road)\b/i, 'Rd')
    .replace(/\bDr(?:ive)?\b/i, 'Dr')
    .replace(/\b(?:Ln|Lane)\b/i, 'Ln')
    .replace(/\b(?:Blvd|Boulevard)\b/i, 'Blvd');
}

function normalizeUnit(value) {
  const cleaned = cleanText(value).replace(/#\s+/, '#');
  const numberedFloor = cleaned.match(/^(\d+)(?:ST|ND|RD|TH)?\s*FL(?:OOR)?$/i);
  if (numberedFloor) return `${numberedFloor[1]}FL`;

  const floorNumber = cleaned.match(/^FL(?:OOR)?\s*(\d+)$/i);
  if (floorNumber) return `Floor ${floorNumber[1]}`;

  return titleCase(cleaned);
}

function inferStateFromPostalCode(postalCode) {
  const prefix = Number(postalCode.slice(0, 3));
  return (prefix >= 10 && prefix <= 27) || prefix === 55 ? 'MA' : null;
}

function regionFromText(text) {
  const cleaned = cleanText(text).replace(/[.;:]$/, '');
  const explicit = cleaned.match(CITY_STATE_ZIP_PATTERN);
  if (explicit) {
    return {
      city: titleCase(explicit[1].replace(/,$/, '').trim()),
      state: explicit[2].toUpperCase(),
      postalCode: explicit[3],
      inferredState: false,
    };
  }

  const missingState = cleaned.match(CITY_ZIP_PATTERN);
  if (!missingState) return null;
  const postalCode = missingState[2];
  const state = inferStateFromPostalCode(postalCode);
  return state ? {
    city: titleCase(missingState[1].replace(/,$/, '').trim()),
    state,
    postalCode,
    inferredState: true,
  } : null;
}

function receiptLines(blocks) {
  const lines = blocks.flatMap((block) => (
    block.lines.length
      ? block.lines
      : block.text.split(/\r?\n/).filter((text) => text.trim()).map((text, index) => ({
        id: `${block.id}-derived-${index}`,
        text,
        boundingBox: block.boundingBox,
      }))
  ));

  return lines
    .map((line) => ({ ...line, cleanedText: cleanText(line.text) }))
    .filter((line) => line.cleanedText)
    .sort((left, right) => {
      const verticalDifference = left.boundingBox.y - right.boundingBox.y;
      return Math.abs(verticalDifference) > 4
        ? verticalDifference
        : left.boundingBox.x - right.boundingBox.x;
    });
}

function candidateScore({ lineIndex, streetLine, regionLine, region, lines, imageSize }) {
  const evidence = ['street number and suffix detected', 'city and ZIP detected'];
  let score = 0.58;

  if (region.inferredState) {
    score += 0.04;
    evidence.push(`${region.state} inferred from ZIP code`);
  } else {
    score += 0.1;
    evidence.push('explicit state detected');
  }

  if (streetLine.id !== regionLine.id) {
    score += 0.05;
    evidence.push('adjacent OCR lines form one address');
  }

  const precedingText = lines
    .slice(Math.max(0, lineIndex - 6), lineIndex)
    .map(({ cleanedText }) => cleanedText)
    .join(' ');
  if (DELIVERY_LABEL_PATTERN.test(precedingText)) {
    score += 0.18;
    evidence.push('delivery label appears nearby');
  }

  const verticalPosition = streetLine.boundingBox.y / imageSize.height;
  if (verticalPosition >= 0.3) {
    score += 0.07;
    evidence.push('address appears below the receipt header');
  }

  const followingText = lines
    .slice(lineIndex + 1, lineIndex + 3)
    .map(({ cleanedText }) => cleanedText)
    .join(' ');
  if (verticalPosition < 0.3 && PHONE_PATTERN.test(followingText)) {
    score -= 0.16;
    evidence.push('header address followed by restaurant phone number');
  }

  return { value: Math.max(0, Math.min(1, score)), evidence };
}

function candidateKey({ streetAddress, city, state, postalCode }) {
  return [streetAddress, city, state, postalCode].join('|').toUpperCase().replace(/[^A-Z0-9|]/g, '');
}

/** Extracts and ranks address candidates without depending on React Native UI or ML Kit APIs. */
export function extractAddressCandidates(blocks, imageSize) {
  const lines = receiptLines(blocks);
  const candidatesByKey = new Map();

  lines.forEach((streetLine, lineIndex) => {
    const streetMatch = streetLine.cleanedText.match(STREET_PATTERN);
    if (!streetMatch) return;

    const trailingText = cleanText(streetMatch[3] ?? '');
    let region = trailingText ? regionFromText(trailingText) : null;
    const unitMatch = !region && trailingText ? trailingText.match(UNIT_PATTERN) : null;
    const unit = unitMatch?.[1] ? normalizeUnit(unitMatch[1]) : '';
    if (unitMatch?.[2]) region = regionFromText(unitMatch[2]);
    const streetAddress = `${normalizeStreet(`${streetMatch[1]} ${streetMatch[2]}`)}${unit ? ` ${unit}` : ''}`;
    let regionLine = streetLine;

    if (!region) {
      const nearbyRegion = lines
        .slice(lineIndex + 1, lineIndex + 3)
        .map((line) => ({ line, region: regionFromText(line.cleanedText) }))
        .find(({ region: match }) => match);
      if (!nearbyRegion) return;
      region = nearbyRegion.region;
      regionLine = nearbyRegion.line;
    }

    const candidate = {
      id: `address-${lineIndex}`,
      streetAddress,
      city: region.city,
      state: region.state,
      postalCode: region.postalCode,
      sourceLineIds: [...new Set([streetLine.id, regionLine.id])],
      confidence: candidateScore({ lineIndex, streetLine, regionLine, region, lines, imageSize }),
    };
    const key = candidateKey(candidate);
    const previous = candidatesByKey.get(key);
    if (!previous || candidate.confidence.value > previous.confidence.value) {
      candidatesByKey.set(key, candidate);
    }
  });

  return [...candidatesByKey.values()]
    .sort((left, right) => right.confidence.value - left.confidence.value)
    .map(createAddressCandidate);
}
