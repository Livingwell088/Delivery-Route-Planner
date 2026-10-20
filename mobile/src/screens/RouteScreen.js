import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { OrderMap } from '../components/OrderMap';
import { StopOrderControls } from '../components/StopOrderControls';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';
import { buildRouteReview, formatRouteClock } from '../services/routeReview';
import { reviewedAddressLabel } from '../services/addressReview';

export function RouteScreen({ route, navigationApp, onNavigate, restaurant, plan, onReviewOrders,
  orders = [], onMove, onRemove, onRecalculate, onOptimize, error }) {
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const ready = plan?.status === 'ready' && Boolean(route);
  const navigationLabel = navigationApp === 'apple' ? 'Apple Maps' : 'Google Maps';

  useEffect(() => {
    if (plan?.status === 'ready') setEditing(false);
  }, [plan?.status]);

  const moreOptions = () => Alert.alert('Route options',
    'Update estimates keeps this stop order. Optimize again may choose a different order.', [
      { text: 'Update estimates', onPress: onRecalculate },
      { text: 'Optimize again', onPress: onOptimize },
      { text: 'Back to orders', onPress: onReviewOrders },
      { text: 'Cancel', style: 'cancel' },
    ]);
  const options = <View style={styles.options}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: editing }}
      style={styles.option} onPress={() => setEditing((value) => !value)}>
      <Text style={styles.optionText}>{editing ? 'Done editing' : 'Edit stops'}</Text>
    </Pressable>
    {ready && <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }}
      style={styles.option} onPress={() => setDetails((value) => !value)}>
      <Text style={styles.optionText}>{details ? 'Hide details' : 'Details'}</Text>
    </Pressable>}
    <Pressable accessibilityRole="button" style={styles.option} onPress={moreOptions}>
      <Text style={styles.optionText}>More</Text>
    </Pressable>
  </View>;

  if (!ready) {
    return <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>{orders.length ? 'Update your route' : 'No orders yet'}</Text>
      <Text accessibilityLiveRegion="polite" style={commonStyles.subtitle}>{plan?.status === 'calculating'
        ? 'Updating route…' : error ?? plan?.error ?? (orders.length
          ? 'Update the estimates before starting navigation.' : 'Scan a receipt to get started.')}</Text>
      {orders.length > 0 && <>
        <AppButton label="Update route" onPress={onRecalculate} />
        {options}
        {orders.map((order, index) => <View style={styles.routeRow} key={order.order_id}>
          <View style={styles.routeMarker}><Text style={styles.routeMarkerText}>{index + 1}</Text></View>
          <View style={commonStyles.orderDetails}>
            <Text style={commonStyles.cardTitle}>Order #{order.order_id}</Text>
            <Text style={commonStyles.muted}>{reviewedAddressLabel(order)}</Text>
            <Text style={commonStyles.muted}>Placed: {formatRouteClock(order.placedAt)}</Text>
            {editing && <StopOrderControls orderId={order.order_id} index={index} count={orders.length} onMove={onMove} onRemove={onRemove} />}
          </View>
        </View>)}
      </>}
      <AppButton label="Back to orders" onPress={onReviewOrders} secondary />
    </ScrollView>;
  }

  const review = buildRouteReview(route);
  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>Your route</Text>
      <Text style={commonStyles.subtitle}>{route.ordered_stops.length} stops · {route.total_drive_minutes} min driving including return</Text>
      <Text style={commonStyles.muted}>Leave {review.departure} · Back {review.returnTime}</Text>
      {options}
      <OrderMap orders={route.ordered_stops} restaurant={restaurant} showRoute />
      {review.stops.map((stop, index) => (
        <View style={styles.routeRow} key={stop.order_id}>
          <View style={styles.routeMarker}><Text style={styles.routeMarkerText}>{stop.position}</Text></View>
          <View style={commonStyles.orderDetails}>
            <Text style={commonStyles.cardTitle}>Order #{stop.order_id}</Text>
            <Text style={commonStyles.muted}>{stop.addressLabel}</Text>
            <Text style={commonStyles.muted}>Placed: {stop.placedTime}</Text>
            <Text style={styles.metric}>Arrive {stop.arrivalTime}</Text>
            <Text style={commonStyles.muted}>Order age at delivery: {stop.predicted_order_age_minutes} min</Text>
            <Text style={commonStyles.muted}>{stop.drive_minutes_from_previous_stop} min driving from {stop.position === 1 ? 'restaurant' : 'previous stop'} · {stop.drive_minutes_from_start} min from departure</Text>
            {editing && <StopOrderControls orderId={stop.order_id} index={index} count={review.stops.length} onMove={onMove} onRemove={onRemove} />}
          </View>
        </View>
      ))}
      <Text style={commonStyles.hint}>{review.assumptions} Stop time is excluded. Update estimates if departure changes.</Text>
      {details && <>
        <View style={styles.infoBox}>
          <Text style={commonStyles.cardTitle}>Return to restaurant</Text>
          <Text style={commonStyles.muted}>{review.restaurant}</Text>
          <Text style={styles.metric}>{review.returnTime}</Text>
          <Text style={commonStyles.muted}>{route.return_drive_minutes} min from the final stop · {route.total_drive_minutes} min for the full route</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={commonStyles.cardTitle}>{route.route_mode === 'evaluated' ? 'About this stop order' : 'Why this route'}</Text>
          {route.explanation.map((line, index) => <Text key={index} style={commonStyles.muted}>{line}</Text>)}
        </View>
        <Text style={commonStyles.hint}>All clocks use Eastern time. Map lines show stop order, not driving roads.</Text>
      </>}
      {!editing && <AppButton label={`Open in ${navigationLabel}`} onPress={onNavigate} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  routeRow: { flexDirection: 'row', gap: 14, paddingVertical: 10, alignItems: 'flex-start' },
  routeMarker: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  routeMarkerText: { color: colors.gold, fontWeight: '900' },
  metric: { color: colors.deepGold, fontWeight: '700', fontSize: 14, lineHeight: 21 },
  infoBox: { backgroundColor: colors.cream, borderRadius: 12, padding: 14, gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  option: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  optionText: { color: colors.deepGold, fontWeight: '700' },
});
