import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { OrderMap } from '../components/OrderMap';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';
import { buildRouteReview } from '../services/routeReview';

export function RouteScreen({ route, navigationApp, onNavigate, restaurant, plan, onReviewOrders }) {
  const navigationLabel = navigationApp === 'apple' ? 'Apple Maps' : 'Google Maps';

  if (plan?.status !== 'ready' || !route) {
    return <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>{plan?.status === 'empty' ? 'No route yet' : 'Route needs calculation'}</Text>
      <Text style={commonStyles.subtitle}>{plan?.error ?? 'Review the current orders and calculate a route before opening navigation.'}</Text>
      <AppButton label="Review orders" onPress={onReviewOrders} />
    </ScrollView>;
  }

  const review = buildRouteReview(route);

  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.eyebrow}>{route.route_mode === 'evaluated' ? 'DRIVER-SELECTED ROUTE' : 'RECOMMENDED ROUTE'}</Text>
      <Text style={commonStyles.title}>{review.title}</Text>
      <Text style={commonStyles.subtitle}>
        {route.total_drive_minutes} min driving including return · {route.ordered_stops.length} stops
      </Text>
      <Text style={commonStyles.muted}>
        Planned departure: {review.departure}. All clocks use Eastern time.
      </Text>
      <Text style={commonStyles.muted}>{review.assumptions} Estimates assume departure at the displayed time and no time at stops. Recalculate if departure changes.</Text>
      <OrderMap orders={route.ordered_stops} restaurant={restaurant} showRoute />
      <Text style={commonStyles.hint}>Stop-order preview. Connecting lines show the sequence; they do not trace driving roads.</Text>
      {review.stops.map((stop) => (
        <View style={styles.routeRow} key={stop.order_id}>
          <View style={styles.routeMarker}>
            <Text style={styles.routeMarkerText}>{stop.position}</Text>
          </View>
          <View style={commonStyles.orderDetails}>
            <Text style={commonStyles.cardTitle}>Order #{stop.order_id}</Text>
            <Text style={commonStyles.muted}>{stop.addressLabel}</Text>
            <Text style={commonStyles.muted}>Placed: {stop.placedTime}</Text>
            <Text style={styles.metric}>
              Estimated arrival: {stop.arrivalTime}
            </Text>
            <Text style={styles.metric}>Predicted order age at delivery: {stop.predicted_order_age_minutes} min</Text>
            <Text style={commonStyles.muted}>{stop.drive_minutes_from_previous_stop} min driving from {stop.position === 1 ? 'restaurant' : 'previous stop'} · {stop.drive_minutes_from_start} min from departure</Text>
          </View>
        </View>
      ))}
      <View style={styles.infoBox}>
        <Text style={commonStyles.cardTitle}>Return to restaurant</Text>
        <Text style={commonStyles.muted}>{review.restaurant}</Text>
        <Text style={styles.metric}>Estimated return: {review.returnTime}</Text>
        <Text style={commonStyles.muted}>{route.return_drive_minutes} min driving from the final stop · {route.total_drive_minutes} min for the full route</Text>
      </View>
      <View style={styles.infoBox}>
        <Text style={commonStyles.cardTitle}>{route.route_mode === 'evaluated' ? 'About this stop order' : 'Why this route'}</Text>
        {route.explanation.map((line, index) => <Text key={index} style={commonStyles.muted}>{line}</Text>)}
      </View>
      <AppButton label={`Open full route in ${navigationLabel}`} onPress={onNavigate} />
      <AppButton label="Review orders" onPress={onReviewOrders} secondary />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  routeRow: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  routeMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeMarkerText: {
    color: colors.gold,
    fontWeight: '900',
  },
  metric: {
    color: colors.deepGold,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
});
