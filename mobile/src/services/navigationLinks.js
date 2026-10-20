const APPS = new Set(['google', 'apple']);
const MAX_STOPS = 8;
const GOOGLE_URL_LIMIT = 2048;

function validAddress(address) {
  const coordinates = address?.coordinates;
  return typeof address?.formatted_address === 'string' && Boolean(address.formatted_address.trim())
    && Number.isFinite(coordinates?.latitude) && Math.abs(coordinates.latitude) <= 90
    && Number.isFinite(coordinates?.longitude) && Math.abs(coordinates.longitude) <= 180;
}

function coordinateString(address) {
  return `${address.coordinates.latitude},${address.coordinates.longitude}`;
}

function queryUrl(base, entries) {
  return `${base}?${entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

export function supportsAppleMultiStopRoutes(platform) {
  if (platform?.OS !== 'ios') return false;
  const version = String(platform.Version ?? '');
  if (!/^\d+(?:\.\d+){0,2}$/.test(version)) return false;
  const [major, minor = 0] = version.split('.').map(Number);
  return major > 18 || (major === 18 && minor >= 4);
}

/** Pure URL construction only. Fresh signed confirmations are enforced by the handoff gate. */
export function createNavigationDestination(navigationApp, address, platform = {}) {
  if (!APPS.has(navigationApp) || !validAddress(address)) return null;
  const destination = coordinateString(address);
  const url = navigationApp === 'google'
    ? queryUrl('https://www.google.com/maps/dir/', [['api', '1'], ['destination', destination], ['travelmode', 'driving']])
    : supportsAppleMultiStopRoutes(platform)
      ? queryUrl('https://maps.apple.com/directions', [['destination', destination], ['mode', 'driving']])
      : queryUrl('https://maps.apple.com/', [['daddr', destination], ['dirflg', 'd']]);
  return { includesAllStops: false, mode: 'single_destination', url };
}

/** destinationIndex equals stops.length for the restaurant return. No array is truncated. */
export function createNavigationRoute(navigationApp, stops, origin, platform = { OS: 'android', Version: 0 }, options = {}) {
  if (!APPS.has(navigationApp) || !Array.isArray(stops) || !stops.length || stops.length > MAX_STOPS
    || !validAddress(origin) || !Array.from(stops).every((stop) => validAddress(stop?.address))
    || !options || typeof options !== 'object' || Array.isArray(options)) return null;
  const { mode = 'full_route', destinationIndex = 0, transport = 'native' } = options;
  if (!['full_route', 'single_destination'].includes(mode) || !['native', 'browser', 'unknown'].includes(transport)
    || !Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex > stops.length) return null;
  let reason = null;
  if (mode === 'single_destination') reason = 'selected_destination';
  else if (transport !== 'native') reason = 'native_unverified';
  else if (navigationApp === 'apple' && !supportsAppleMultiStopRoutes(platform)) reason = 'apple_multistop_unavailable';
  const fallback = (fallbackReason) => ({
    ...createNavigationDestination(navigationApp, destinationIndex === stops.length ? origin : stops[destinationIndex].address, platform),
    reason: fallbackReason, destinationIndex,
  });
  if (reason) return fallback(reason);
  const restaurant = coordinateString(origin);
  const url = navigationApp === 'google'
    ? queryUrl('https://www.google.com/maps/dir/', [
      ['api', '1'], ['origin', restaurant], ['destination', restaurant],
      ['waypoints', stops.map((stop) => coordinateString(stop.address)).join('|')], ['travelmode', 'driving'],
    ])
    : queryUrl('https://maps.apple.com/directions', [
      ['source', restaurant], ...stops.map((stop) => ['waypoint', coordinateString(stop.address)]),
      ['destination', restaurant], ['mode', 'driving'],
    ]);
  if (navigationApp === 'google' && url.length > GOOGLE_URL_LIMIT) return fallback('url_limit');
  return { includesAllStops: true, mode: 'full_route', url };
}
