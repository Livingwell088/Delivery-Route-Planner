const DEFAULT_SELECTION = Object.freeze({ mode: 'full_route', destinationIndex: 0 });

export function currentNavigationSelection(selection, route) {
  return route && selection?.route === route ? selection : DEFAULT_SELECTION;
}

export function createNavigationSelection(route, mode, destinationIndex = 0) {
  if (!route?.ordered_stops?.length || !['full_route', 'single_destination'].includes(mode)
    || !Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex > route.ordered_stops.length) return null;
  return { route, mode, destinationIndex: mode === 'full_route' ? 0 : destinationIndex };
}
