const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

function ageInMinutes(placedAt) {
  return Math.max(0, Math.floor((Date.now() - new Date(placedAt).getTime()) / 60_000));
}

export async function optimizeRoute(start, orders, {
  fetchImpl = globalThis.fetch, signal, timeoutMs = 35_000,
} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(`${API_URL}/routes/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        start,
        orders: orders.map((order) => ({
          order_id: order.order_id,
          address: order.address,
          age_minutes: ageInMinutes(order.placedAt),
        })),
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      const messages = {
        map_usage_limit_reached: 'This app has reached its Google usage allowance. Your orders are saved; contact the administrator before retrying.',
        map_usage_unavailable: 'Google usage tracking is unavailable. Your orders are saved; ask the administrator to check the backend.',
        map_provider_configuration_error: 'Route planning is unavailable because the server Google configuration needs attention.',
        map_provider_rate_limited: 'Google route planning has reached its usage limit. Your orders are saved; try again later.',
        map_provider_unavailable: 'Google route planning is temporarily unavailable. Your orders are saved; try again.',
      };
      const error = new Error(messages[body?.error?.code] ?? body?.error?.message ?? `Route request failed (${response.status})`);
      error.code = body?.error?.code;
      throw error;
    }
    if (!Array.isArray(body?.ordered_stops) || body.ordered_stops.length !== orders.length
      || new Set(body.ordered_stops.map((stop) => stop.order_id)).size !== orders.length
      || body.ordered_stops.some((stop) => !orders.some((order) => order.order_id === stop.order_id)
        || !Number.isFinite(stop.address?.coordinates?.latitude) || !Number.isFinite(stop.address?.coordinates?.longitude))
      || !Number.isFinite(body.total_drive_minutes) || body.total_drive_minutes < 0
      || !Array.isArray(body.explanation) || body.explanation.some((line) => typeof line !== 'string')) {
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

export const apiUrl = API_URL;
