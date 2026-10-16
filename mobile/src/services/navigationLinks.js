import { DEFAULT_RESTAURANT } from '../data/mockReceipts.js';

function coordinateString(coordinates) {
  return `${coordinates.latitude},${coordinates.longitude}`;
}

function encodedCoordinates(coordinates) {
  return encodeURIComponent(coordinateString(coordinates));
}

function encodedAddress(address) {
  return encodeURIComponent(address.formatted_address);
}

function buildGoogleMapsUrl(stops, origin) {
  const restaurant = encodedCoordinates(origin.coordinates);
  const waypoints = stops
    .map((stop) => coordinateString(stop.address.coordinates))
    .join('|');

  const query = [
    'api=1',
    `origin=${restaurant}`,
    `destination=${restaurant}`,
    `waypoints=${encodeURIComponent(waypoints)}`,
    'travelmode=driving',
  ].join('&');
  return `https://www.google.com/maps/dir/?${query}`;
}

function supportsAppleMultiStopRoutes(platform) {
  if (platform.OS !== 'ios') return false;
  return Number.parseFloat(String(platform.Version)) >= 18.4;
}

function buildAppleMapsUrl(stops, origin) {
  const restaurant = encodedAddress(origin);
  const waypoints = stops
    .map((stop) => `waypoint=${encodedAddress(stop.address)}`)
    .join('&');

  const query = [
    `source=${restaurant}`,
    waypoints,
    `destination=${restaurant}`,
    'mode=driving',
  ].join('&');
  return `https://maps.apple.com/directions?${query}`;
}

function buildAppleFirstStopFallback(stops) {
  return `http://maps.apple.com/?daddr=${encodedAddress(stops[0].address)}&dirflg=d`;
}

export function createNavigationRoute(navigationApp, stops, origin = DEFAULT_RESTAURANT, platform = { OS: 'android', Version: 0 }) {
  if (!stops.length) return null;

  if (navigationApp === 'apple') {
    const includesAllStops = supportsAppleMultiStopRoutes(platform);
    return {
      includesAllStops,
      url: includesAllStops ? buildAppleMapsUrl(stops, origin) : buildAppleFirstStopFallback(stops),
    };
  }

  return {
    includesAllStops: true,
    url: buildGoogleMapsUrl(stops, origin),
  };
}
