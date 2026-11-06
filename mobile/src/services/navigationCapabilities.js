/** App-specific probes; an HTTPS handler is never used as installation evidence. */
export async function navigationAvailability(app, platform, { canOpenURL, androidMaps } = {}) {
  if (!['google', 'apple'].includes(app)) return 'unavailable';
  if (app === 'apple' && platform?.OS !== 'ios') return 'unavailable';
  try {
    let available;
    if (platform?.OS === 'android' && app === 'google') {
      if (!androidMaps?.isAvailable) return 'unknown';
      available = await androidMaps.isAvailable();
    } else if (platform?.OS === 'ios') {
      if (!canOpenURL) return 'unknown';
      available = await canOpenURL(app === 'google' ? 'comgooglemapsurl://' : 'maps://');
    } else return 'unknown';
    return available === true ? 'available' : available === false ? 'unavailable' : 'unknown';
  } catch { return 'unknown'; }
}

export function nativeNavigationURL(app, platform, url) {
  return app === 'google' && platform?.OS === 'ios'
    ? url.replace('https://', 'comgooglemapsurl://') : url;
}
