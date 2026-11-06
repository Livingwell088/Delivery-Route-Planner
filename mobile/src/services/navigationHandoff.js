import { canNavigateRoute } from './routePlan.js';
import { createNavigationRoute } from './navigationLinks.js';
import { navigationAvailability, nativeNavigationURL } from './navigationCapabilities.js';
import { navigationAppOptions } from './navigationPreferences.js';

/** Recheck fresh state after each asynchronous probe/dialog, immediately before launch. */
export async function openRouteNavigation({ getCurrent, navigationApp, platform, openURL,
  canOpenURL, androidMaps, notifyFallback = async () => false,
  chooseAlternative = async () => null, forceChoice = false, now = Date.now,
  mode = 'full_route', destinationIndex = 0 }) {
  const snapshot = getCurrent();
  const currentRoute = () => {
    const current = getCurrent();
    return current.active !== false && current.plan === snapshot.plan
      && (snapshot.navigationApp === undefined || current.navigationApp === snapshot.navigationApp)
      && (snapshot.destinationIndex === undefined || current.destinationIndex === snapshot.destinationIndex)
      && canNavigateRoute(current.plan, current.orders, current.restaurant, now());
  };
  if (!currentRoute()) return { status: 'needs_calculation' };
  try {
    const probe = (app) => navigationAvailability(app, platform, { canOpenURL, androidMaps });
    let app = navigationApp;
    const availability = await probe(app);
    if (!currentRoute()) return { status: 'needs_calculation' };
    let transport = 'native';
    if (availability !== 'available' || forceChoice) {
      const alternatives = [];
      for (const option of navigationAppOptions(platform)) {
        const state = option.value === app ? availability : await probe(option.value);
        if (!currentRoute()) return { status: 'needs_calculation' };
        if (state === 'available') alternatives.push({ app: option.value, transport: 'native', label: option.label });
      }
      // Universal links may still open an app; promise one destination, not a browser.
      alternatives.push({ app: 'google', transport: 'browser', label: 'Google Maps link (one stop)' });
      const choice = await chooseAlternative({ navigationApp: app, availability, alternatives });
      if (!currentRoute()) return { status: 'needs_calculation' };
      if (!choice) return { status: 'cancelled' };
      const accepted = alternatives.find((item) => item.app === choice.app && item.transport === choice.transport);
      if (!accepted) return { status: 'cancelled' };
      app = accepted.app;
      transport = accepted.transport;
    }
    const link = createNavigationRoute(app, snapshot.plan.route.ordered_stops, snapshot.restaurant, platform,
      { mode, destinationIndex, transport });
    if (!link) return { status: 'invalid', message: 'Review the route destinations and calculate the route again before opening navigation.' };
    if (!link.includesAllStops) {
      const proceed = await notifyFallback({ app, transport, link });
      if (!currentRoute()) return { status: 'needs_calculation' };
      if (proceed !== true) return { status: 'cancelled' };
    }
    if (!currentRoute()) return { status: 'needs_calculation' };
    if (transport === 'native' && platform?.OS === 'android' && app === 'google') {
      if (!androidMaps?.open) throw new Error('Native navigation unavailable');
      await androidMaps.open(link.url);
    } else await openURL(transport === 'native' ? nativeNavigationURL(app, platform, link.url) : link.url);
    return { status: 'opened', app, transport, mode: link.mode, destinationIndex: link.destinationIndex };
  } catch {
    return { status: 'failed', message: 'Unable to open navigation. Your route is still available; retry or choose another option.' };
  }
}
