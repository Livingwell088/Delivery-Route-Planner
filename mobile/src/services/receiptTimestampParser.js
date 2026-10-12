import { receiptLines, relatedFollowingLine, relatedSameRowLine, hasLineGeometry } from './receiptLines.js';
import { createTimestampCandidate } from '../domain/receiptScan.js';

const DATE_PATTERN = /\b(0?[1-9]|1[0-2])\s*[\/-]\s*(0?[1-9]|[12]\d|3[01])\s*[\/-]\s*(\d{2}|\d{4})\b/i;
const TIME_PATTERN = /\b(0?[1-9]|1[0-2])\s*(?::|[.;]|\s)?\s*([0-5]\d)\s*(AM|PM)\b/i;
const ORDER_LABEL_PATTERN = /\b(?:order(?:ed)?|date|time|placed|delivery)\b/i;



function parseDate(match) {
  const month = Number(match[1]);
  const day = Number(match[2]);
  const suppliedYear = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + suppliedYear : suppliedYear;
  const value = new Date(year, month - 1, day);

  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function parseTime(match) {
  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  return {
    hour: (hour12 % 12) + (meridiem === 'PM' ? 12 : 0),
    minute,
  };
}

function candidateScore({ sameLine, lineIndex, lines, timeLine }) {
  const evidence = ['valid receipt date detected', 'valid 12-hour time detected'];
  let value = 0.65;
  if (!hasLineGeometry(lines[lineIndex])) {
    value -= 0.2;
    evidence.push('OCR line geometry unavailable');
  }

  if (sameLine) {
    value += 0.12;
    evidence.push('date and time appear on the same OCR line');
  }
  if (!sameLine && relatedSameRowLine(lines[lineIndex], timeLine)) {
    value += 0.07;
    evidence.push('date and time appear in neighboring blocks on the same row');
  }

  const nearbyText = lines
    .slice(Math.max(0, lineIndex - 2), lineIndex + 2)
    .map(({ cleanedText }) => cleanedText)
    .join(' ');
  if (ORDER_LABEL_PATTERN.test(nearbyText)) {
    value += 0.15;
    evidence.push('order-related label appears nearby');
  }

  if (/\b(?:reprinted?|printed|payment|paid|settled)\b/i.test(`${lines[lineIndex].cleanedText} ${timeLine.cleanedText}`)) {
    value -= 0.3;
    evidence.push('payment or reprint timestamp label detected');
  }

  return { value: Math.min(1, value), evidence };
}

/** Extracts and ranks order timestamp candidates without depending on UI or the OCR provider. */
export function extractTimestampCandidates(blocks) {
  const lines = receiptLines(blocks);
  const candidatesByTimestamp = new Map();

  lines.forEach((dateLine, lineIndex) => {
    const dateMatch = dateLine.cleanedText.match(DATE_PATTERN);
    if (!dateMatch) return;

    const parsedDate = parseDate(dateMatch);
    if (!parsedDate) return;

    const possibleTimeLines = [dateLine, ...lines.filter((line) => line.id !== dateLine.id
      && !DATE_PATTERN.test(line.cleanedText) && relatedSameRowLine(dateLine, line))];
    for (const line of lines.slice(lineIndex + 1, lineIndex + 3)) {
      if (DATE_PATTERN.test(line.cleanedText)) break;
      if (relatedFollowingLine(dateLine, line)) possibleTimeLines.push(line);
    }
    const timeLine = possibleTimeLines.find(({ cleanedText }) => TIME_PATTERN.test(cleanedText));
    if (!timeLine) return;

    const timeMatch = timeLine.cleanedText.match(TIME_PATTERN);
    const parsedTime = parseTime(timeMatch);
    const timestamp = new Date(
      parsedDate.year,
      parsedDate.month - 1,
      parsedDate.day,
      parsedTime.hour,
      parsedTime.minute,
    );
    const sameLine = dateLine.id === timeLine.id;
    const candidate = {
      id: `timestamp-${lineIndex}`,
      rawDate: dateMatch[0],
      rawTime: timeMatch[0],
      timestamp,
      sourceLineIds: [...new Set([dateLine.id, timeLine.id])],
      confidence: candidateScore({ sameLine, lineIndex, lines, timeLine }),
    };
    const key = timestamp.toISOString();
    const previous = candidatesByTimestamp.get(key);
    if (!previous || candidate.confidence.value > previous.confidence.value) {
      candidatesByTimestamp.set(key, candidate);
    }
  });

  return [...candidatesByTimestamp.values()]
    .sort((left, right) => right.confidence.value - left.confidence.value)
    .map(createTimestampCandidate);
}
