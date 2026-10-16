export const ACTIVE_SESSION_KEY = 'active-deliveries-v1';
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

function validAddress(address, now) {
  const location = address?.validated_location;
  const coordinates = address?.coordinates;
  return typeof address?.formatted_address === 'string' && address.formatted_address.trim()
    && typeof address.raw_address === 'string' && address.raw_address.trim()
    && typeof location?.validation_reference === 'string' && location.validation_reference
    && typeof location.place_id === 'string' && location.place_id
    && location.provider === 'google'
    && Number.isFinite(coordinates?.latitude) && Math.abs(coordinates.latitude) <= 90
    && Number.isFinite(coordinates?.longitude) && Math.abs(coordinates.longitude) <= 180
    && Date.parse(location.expires_at) > now;
}

export function encodeActiveSession(orders, fingerprints, now = Date.now()) {
  return JSON.stringify({ version: 1, savedAt: now,
    orders: orders.map(({ order_id, address, placedAt, receiptFingerprints = [] }) => ({ order_id, address, placedAt, receiptFingerprints })),
    fingerprints,
  });
}

export function decodeActiveSession(text, now = Date.now()) {
  if (!text) return { orders: [], fingerprints: [] };
  try {
    const data = JSON.parse(text);
    if (data.version !== 1 || !Number.isFinite(data.savedAt) || data.savedAt > now
      || now - data.savedAt >= MAX_AGE_MS || !Array.isArray(data.orders)
      || !Array.isArray(data.fingerprints) || data.fingerprints.some((f) => typeof f !== 'string')
      || new Set(data.orders.map((o) => o.order_id)).size !== data.orders.length
      || data.orders.some((o) => typeof o.order_id !== 'string' || !o.order_id.trim()
        || !Number.isFinite(Date.parse(o.placedAt))
        || !validAddress(o.address, now)
        || !Array.isArray(o.receiptFingerprints)
        || o.receiptFingerprints.some((f) => typeof f !== 'string'))) {
      throw new Error('Expired or incompatible session');
    }
    return { orders: data.orders, fingerprints: data.fingerprints };
  } catch {
    return { orders: [], fingerprints: [], discarded: true };
  }
}

/** Serialize writes so an older save cannot overwrite a later removal. */
export function createSessionWriter(storage) {
  let pending = Promise.resolve();
  return (text) => {
    pending = pending.catch(() => {}).then(() => storage.setItem(ACTIVE_SESSION_KEY, text));
    return pending;
  };
}
