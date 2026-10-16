const ZONE = 'America/New_York';
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
});

function parts(date) {
  return Object.fromEntries(partsFormatter.formatToParts(date)
    .filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]));
}

export function formatPlacedTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? timeFormatter.format(date) : '';
}

/** Edit the clock on the original Eastern calendar day; keep ISO internally. */
export function editPlacedTime(text, original, now = new Date()) {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  let anchor = new Date(original);
  if (!original || !Number.isFinite(anchor.getTime())) anchor = now;
  const day = parts(anchor);
  if (day.hour === hour && day.minute === minute) return anchor.toISOString();
  const wall = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  // Modern Eastern Time uses UTC-4 in daylight time and UTC-5 in standard time.
  // Prefer the anchor's offset for the repeated fall-back hour. Reject a clock
  // time in the spring-forward gap instead of silently rolling it forward.
  const anchorWall = Date.UTC(day.year, day.month - 1, day.day, day.hour, day.minute);
  const preferred = Math.round((anchor.getTime() - anchorWall) / 3_600_000);
  for (const offset of [...new Set([preferred, 4, 5])]) {
    const candidate = new Date(wall + offset * 3_600_000);
    const actual = parts(candidate);
    if (actual.year === day.year && actual.month === day.month && actual.day === day.day
      && actual.hour === hour && actual.minute === minute) return candidate.toISOString();
  }
  return null;
}
