import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { OrderMap } from '../components/OrderMap';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';
import { formatPlacedTime } from '../services/placedTime';

export function RouteScreen({ route, navigationApp, onNavigate, restaurant, plan, onReviewOrders }) {
  const navigationLabel = navigationApp === 'apple' ? 'Apple Maps' : 'Google Maps';

  if (plan?.status !== 'ready' || !route) {
    return <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>{plan?.status === 'empty' ? 'No route yet' : 'Route needs calculation'}</Text>
      <Text style={commonStyles.subtitle}>{plan?.error ?? 'Review the current orders and calculate a route before opening navigation.'}</Text>
      <AppButton label="Review orders" onPress={onReviewOrders} />
    </ScrollView>;
  }

  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.eyebrow}>RECOMMENDED ROUTE</Text>
      <Text style={commonStyles.title}>Your ordered stops</Text>
      <Text style={commonStyles.subtitle}>
        {route.total_drive_minutes} min driving · {route.ordered_stops.length} stops
      </Text>
      <Text style={commonStyles.muted}>
        Planned departure {formatPlacedTime(plan.departureAt)} Eastern. Estimates assume departure at this time, exclude live traffic, and allow no time at stops. Recalculate if departure changes.
      </Text>
      <OrderMap orders={route.ordered_stops} restaurant={restaurant} showRoute />
      {route.ordered_stops.map((stop) => (
        <View style={styles.routeRow} key={stop.order_id}>
          <View style={styles.routeMarker}>
            <Text style={styles.routeMarkerText}>{stop.position}</Text>
          </View>
          <View style={commonStyles.orderDetails}>
            <Text style={commonStyles.cardTitle}>Order #{stop.order_id}</Text>
            <Text style={commonStyles.muted}>{stop.address.formatted_address}</Text>
            <Text style={styles.metric}>
              ETA +{stop.drive_minutes_from_start} min · predicted wait {stop.predicted_wait_minutes} min
            </Text>
          </View>
        </View>
      ))}
      <View style={styles.infoBox}>
        <Text style={commonStyles.muted}>{route.explanation[0]}</Text>
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
  },
  infoBox: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 14,
  },
});
