import { validSequence } from './routePlan.js';

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

export function encodeActiveSession(orders, fingerprints, now = Date.now(), routePreference = null) {
  return JSON.stringify({ version: 1, savedAt: now,
    orders: orders.map(({ order_id, address, placedAt, receiptFingerprints = [] }) => ({ order_id, address, placedAt, receiptFingerprints })),
    fingerprints,
    ...(routePreference && validSequence(routePreference.sequence, orders)
      && ['manual', 'optimized'].includes(routePreference.source) ? { routePreference: {
        sequence: routePreference.sequence, source: routePreference.source,
      } } : {}),
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
    // An incompatible preference must not discard otherwise valid active orders.
    const preference = data.routePreference;
    return { orders: data.orders, fingerprints: data.fingerprints,
      ...(preference && validSequence(preference.sequence, data.orders)
        && ['manual', 'optimized'].includes(preference.source)
        ? { routePreference: { sequence: preference.sequence, source: preference.source } } : {}),
    };
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

/** Never overwrite unread saved data after a failed restore. Only the latest save reports status. */
export function createSessionPersistence(storage, onStatus = () => {}) {
  const write = createSessionWriter(storage);
  let writable = false;
  let version = 0;
  let latestText = null;
  const save = async (text) => {
    if (!writable) return false;
    latestText = text;
    const current = ++version;
    try {
      await write(text);
      if (current === version) onStatus({ kind: 'ready' });
      return true;
    } catch {
      if (current === version) onStatus({ kind: 'save_failed' });
      return false;
    }
  };
  return {
    async restore() {
      writable = false;
      try {
        const text = await storage.getItem(ACTIVE_SESSION_KEY);
        const restored = decodeActiveSession(text);
        writable = true;
        onStatus({ kind: 'ready' });
        return restored;
      } catch (error) {
        onStatus({ kind: 'restore_failed' });
        throw error;
      }
    },
    save,
    retrySave: () => latestText === null ? Promise.resolve(false) : save(latestText),
    startNewRun() { writable = true; latestText = null; version++; onStatus({ kind: 'ready' }); },
  };
}
