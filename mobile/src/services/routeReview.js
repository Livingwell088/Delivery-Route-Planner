import { reviewedAddressLabel } from './addressReview.js';
import { formatPlacedTime } from './placedTime.js';

const zone = 'America/New_York';
const calendar = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const zoneClock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', timeZoneName: 'short' });
const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' });

function calendarDay(date) {
  const parts = Object.fromEntries(calendar.formatToParts(date).map(({ type, value }) => [type, value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
}

/** Day labels use Eastern calendar days, not UTC days or 24-hour elapsed intervals. */
export function formatRouteClock(value, departureAt = value) {
  const date = new Date(value);
  const reference = new Date(departureAt);
  if (!value || !Number.isFinite(date.getTime()) || !Number.isFinite(reference.getTime())) return 'Unavailable';
  const difference = calendarDay(date) - calendarDay(reference);
  const day = difference === 0 ? '' : difference === 1 ? ' · next day' : difference === -1 ? ' · previous day' : ` · ${dateLabel.format(date)}`;
  const zoneName = zoneClock.formatToParts(date).find(({ type }) => type === 'timeZoneName')?.value ?? 'Eastern';
  return `${formatPlacedTime(value)} ${zoneName}${day}`;
}

export function buildRouteReview(route) {
  return {
    title: route.route_mode === 'evaluated' ? 'Your selected stop order' : 'Your recommended stops',
    departure: formatRouteClock(route.departure_at),
    restaurant: route.start.formatted_address,
    returnTime: formatRouteClock(route.return_at, route.departure_at),
    assumptions: route.travel_time_basis === 'traffic_unaware'
      ? 'Google driving estimates exclude live traffic.' : 'Development driving estimates; not Google road times.',
    stops: route.ordered_stops.map((stop) => ({
      ...stop,
      addressLabel: reviewedAddressLabel(stop),
      placedTime: formatRouteClock(stop.placed_at, route.departure_at),
      arrivalTime: formatRouteClock(stop.arrival_at, route.departure_at),
    })),
  };
}
