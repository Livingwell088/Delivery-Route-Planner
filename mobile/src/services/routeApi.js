const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

function ageInMinutes(placedAt) {
  return Math.max(0, Math.floor((Date.now() - new Date(placedAt).getTime()) / 60_000));
}

export async function optimizeRoute(start, orders) {
  const response = await fetch(`${API_URL}/routes/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start,
      orders: orders.map((order) => ({
        order_id: order.order_id,
        address: order.address,
        age_minutes: ageInMinutes(order.placedAt),
      })),
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `Route request failed (${response.status})`);
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

export const apiUrl = API_URL;
