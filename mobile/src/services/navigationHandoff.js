import { canNavigateRoute } from './routePlan.js';
import { createNavigationRoute } from './navigationLinks.js';

/** Check fresh state again after any fallback notice, immediately before launch. */
export async function openRouteNavigation({ getCurrent, navigationApp, platform, openURL,
  notifyFallback = () => {}, now = Date.now }) {
  const snapshot = getCurrent();
  if (!canNavigateRoute(snapshot.plan, snapshot.orders, snapshot.restaurant, now())) return { status: 'needs_calculation' };
  try {
    const link = createNavigationRoute(navigationApp, snapshot.plan.route.ordered_stops, snapshot.restaurant, platform);
    if (!link) return { status: 'needs_calculation' };
    if (!link.includesAllStops) await notifyFallback();
    const current = getCurrent();
    if (current.plan !== snapshot.plan || !canNavigateRoute(current.plan, current.orders, current.restaurant, now())) {
      return { status: 'needs_calculation' };
    }
    await openURL(link.url);
    return { status: 'opened' };
  } catch {
    return { status: 'failed', message: 'Unable to open the Maps app. Your route is still available; try again.' };
  }
}
