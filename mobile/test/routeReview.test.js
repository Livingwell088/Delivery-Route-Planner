import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRouteReview, formatRouteClock } from '../src/services/routeReview.js';

const route = {
  departure_at: '2026-10-19T22:00:00Z', return_at: '2026-10-19T22:24:00Z',
  total_drive_minutes: 24, return_drive_minutes: 10, route_mode: 'optimized', travel_time_basis: 'traffic_unaware',
  start: { formatted_address: 'Restaurant' },
  ordered_stops: [
    { order_id: 'A', position: 1, address: { formatted_address: '10 Example St, Apt 2, Worcester, MA', unit: 'Apt 2', validated_location: { provider: 'google' } },
      placed_at: '2026-10-19T21:30:00Z', arrival_at: '2026-10-19T22:08:00Z', predicted_order_age_minutes: 38 },
    { order_id: 'B', position: 2, address: { formatted_address: '20 Example St, Worcester, MA' },
      placed_at: '2026-10-19T21:45:00Z', arrival_at: '2026-10-19T22:14:00Z', predicted_order_age_minutes: 29 },
  ],
};

test('review distinguishes placed clocks, arrival clocks, total age and restaurant return', () => {
  const review = buildRouteReview(route);
  assert.equal(review.departure, '6:00 PM EDT');
  assert.deepEqual(review.stops.map((stop) => stop.placedTime), ['5:30 PM EDT', '5:45 PM EDT']);
  assert.deepEqual(review.stops.map((stop) => stop.arrivalTime), ['6:08 PM EDT', '6:14 PM EDT']);
  assert.deepEqual(review.stops.map((stop) => stop.predicted_order_age_minutes), [38, 29]);
  assert.equal(review.returnTime, '6:24 PM EDT');
  assert.equal(review.restaurant, 'Restaurant');
  assert.match(review.assumptions, /exclude live traffic/);
});

test('Eastern calendar dates label midnight, earlier receipt days and longer planning intervals', () => {
  const departure = '2026-10-20T03:58:00Z';
  assert.equal(formatRouteClock('2026-10-20T04:06:00Z', departure), '12:06 AM EDT · next day');
  assert.equal(formatRouteClock('2026-10-19T23:30:00Z', departure), '7:30 PM EDT');
  assert.equal(formatRouteClock('2026-10-19T03:30:00Z', departure), '11:30 PM EDT · previous day');
  assert.equal(formatRouteClock('2026-10-22T04:06:00Z', departure), '12:06 AM EDT · Oct 22, 2026');
});

test('Eastern daylight-saving transitions retain actual offsets and calendar-day labels', () => {
  assert.equal(formatRouteClock('2026-11-01T06:06:00Z', '2026-11-01T05:58:00Z'), '1:06 AM EST');
  assert.equal(formatRouteClock('2026-03-08T07:06:00Z', '2026-03-08T06:58:00Z'), '3:06 AM EDT');
});

test('confirmed unit appears once and manual routes are labeled driver-selected', () => {
  const review = buildRouteReview({ ...route, route_mode: 'evaluated' });
  assert.equal(review.title, 'Your selected stop order');
  assert.equal(review.stops[0].addressLabel.match(/Apt 2/g).length, 1);
  assert.equal(buildRouteReview(route).title, 'Your recommended stops');
});

test('development estimates are explicitly distinguished and invalid clocks do not show a false ETA', () => {
  assert.match(buildRouteReview({ ...route, travel_time_basis: 'development_estimate' }).assumptions, /Development/);
  assert.equal(formatRouteClock('invalid'), 'Unavailable');
  assert.equal(formatRouteClock(null), 'Unavailable');
});
