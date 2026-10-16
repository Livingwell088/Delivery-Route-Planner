import { Platform } from 'react-native';
import { createNavigationRoute as buildNavigationRoute } from './navigationLinks.js';

export function createNavigationRoute(navigationApp, stops, origin) {
  return buildNavigationRoute(navigationApp, stops, origin, Platform);
}
