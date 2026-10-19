import { validSequence } from './routePlan.js';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const nonnegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

function addressKey(address) {
  const location = address?.validated_location;
  return JSON.stringify([typeof address?.formatted_address === 'string' ? address.formatted_address.trim() : null,
    typeof address?.raw_address === 'string' ? address.raw_address.trim() : null,
    address?.unit ?? null, address?.coordinates?.latitude, address?.coordinates?.longitude,
    location ? [location.provider, location.place_id, location.validation_reference, location.normalized_address,
      location.coordinates?.latitude, location.coordinates?.longitude,
      Date.parse(location.validated_at), Date.parse(location.expires_at)] : null]);
}

function completeRoute(body, start, orders, departureTime, sequence) {
  if (!Array.isArray(body?.ordered_stops) || !validSequence(body.ordered_stops.map((stop) => stop?.order_id), orders)
    || !nonnegativeInteger(body.total_drive_minutes) || !nonnegativeInteger(body.return_drive_minutes)
    || !Number.isFinite(body.score) || body.score < 0
    || !Array.isArray(body.explanation) || body.explanation.some((line) => typeof line !== 'string')
    || Date.parse(body.departure_at) !== departureTime || !Number.isFinite(Date.parse(body.calculated_at))
    || Date.parse(body.return_at) !== departureTime + body.total_drive_minutes * 60_000
    || body.route_mode !== (sequence ? 'evaluated' : 'optimized') || body.stop_service_minutes !== 0
    || !['traffic_unaware', 'development_estimate'].includes(body.travel_time_basis)
    || (start.validated_location?.provider === 'google' && body.travel_time_basis !== 'traffic_unaware')
    || addressKey(body.start) !== addressKey(start)) return false;
  let elapsed = 0;
  for (const [index, stop] of body.ordered_stops.entries()) {
    const order = orders.find((item) => item.order_id === stop.order_id);
    const age = Math.floor((Date.parse(stop.arrival_at) - Date.parse(order.placedAt)) / 60_000);
    if (stop.position !== index + 1 || (sequence && stop.order_id !== sequence[index])
      || addressKey(stop.address) !== addressKey(order.address)
      || !Number.isFinite(stop.address?.coordinates?.latitude) || !Number.isFinite(stop.address?.coordinates?.longitude)
      || !nonnegativeInteger(stop.drive_minutes_from_start) || stop.drive_minutes_from_start < elapsed
      || !nonnegativeInteger(stop.drive_minutes_from_previous_stop)
      || stop.drive_minutes_from_previous_stop !== stop.drive_minutes_from_start - elapsed
      || Date.parse(stop.arrival_at) !== departureTime + stop.drive_minutes_from_start * 60_000
      || Date.parse(stop.placed_at) !== Date.parse(order.placedAt) || stop.age_basis !== 'placed_at'
      || !nonnegativeInteger(stop.predicted_order_age_minutes) || stop.predicted_order_age_minutes !== age
      || stop.predicted_wait_minutes !== age || !nonnegativeInteger(stop.late_minutes)) return false;
    elapsed = stop.drive_minutes_from_start;
  }
  return body.total_drive_minutes === elapsed + body.return_drive_minutes;
}

async function requestRoute(start, orders, sequence, {
  fetchImpl = globalThis.fetch, signal, timeoutMs = 35_000, departureAt = new Date().toISOString(),
} = {}) {
  const departureTime = Date.parse(departureAt);
  if (!Number.isFinite(departureTime)) throw new Error('Invalid route departure time.');
  if (!orders.length || orders.length > 8 || !validSequence(orders.map((order) => order.order_id), orders)
    || orders.some((order) => typeof order.order_id !== 'string' || !order.order_id.trim() || order.order_id.trim() !== order.order_id || order.order_id === 'start')) {
    throw new Error('A route needs between one and eight distinct orders.');
  }
  if (orders.some((order) => !Number.isFinite(Date.parse(order.placedAt)) || Date.parse(order.placedAt) > departureTime)) {
    throw new Error('Check order placed times: each must be valid and no later than departure.');
  }
  if (sequence && !validSequence(sequence, orders)) throw new Error('The sequence must contain every current order exactly once.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(`${API_URL}/routes/${sequence ? 'evaluate' : 'optimize'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        start,
        departure_at: departureAt,
        ...(sequence ? { sequence } : {}),
        orders: orders.map((order) => ({
          order_id: order.order_id,
          address: order.address,
          placed_at: order.placedAt,
        })),
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      const details = body?.error?.details;
      const outdatedContract = body?.error?.code === 'validation_error' && Array.isArray(details)
        && details.some((detail) => Array.isArray(detail.loc) && (
          (detail.type === 'missing' && detail.loc.at(-1) === 'age_minutes')
          || (detail.type === 'extra_forbidden' && ['placed_at', 'departure_at'].includes(detail.loc.at(-1)))
        ));
      const messages = {
        map_usage_limit_reached: 'This app has reached its Google usage allowance. Your orders are saved; contact the administrator before retrying.',
        map_usage_unavailable: 'Google usage tracking is unavailable. Your orders are saved; ask the administrator to check the backend.',
        map_provider_configuration_error: 'Route planning is unavailable because the server Google configuration needs attention.',
        map_provider_rate_limited: 'Google route planning has reached its usage limit. Your orders are saved; try again later.',
        map_provider_unavailable: 'Google route planning is temporarily unavailable. Your orders are saved; try again.',
      };
      const error = new Error(outdatedContract
        ? 'The backend is running an older route API. Restart the backend to load the updated code, then retry. Your orders are saved.'
        : messages[body?.error?.code] ?? body?.error?.message ?? `Route request failed (${response.status})`);
      error.code = body?.error?.code;
      throw error;
    }
    if (!completeRoute(body, start, orders, departureTime, sequence)) {
      throw new Error('The server returned an incomplete route. Your orders are saved; try again.');
    }
    return body;
  } catch (error) {
    if (timedOut) throw new Error('Route planning timed out. Your orders are saved; try again.');
    if (signal?.aborted) throw error;
    if (error instanceof SyntaxError) throw new Error('The server returned an unreadable route. Your orders are saved; try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach route planning. Check the backend and your connection; your orders are saved.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function optimizeRoute(start, orders, options) {
  return requestRoute(start, orders, null, options);
}

export function evaluateRoute(start, orders, sequence, options) {
  if (!validSequence(sequence, orders)) return Promise.reject(new Error('The sequence must contain every current order exactly once.'));
  return requestRoute(start, orders, sequence, options);
}

export const apiUrl = API_URL;
