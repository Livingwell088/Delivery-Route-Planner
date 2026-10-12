import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { DEFAULT_RESTAURANT } from '../data/mockReceipts';
import { colors } from '../theme/colors';

const MAP_PADDING = { top: 45, right: 45, bottom: 45, left: 45 };
const MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

function getInitialRegion(coordinates) {
  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);

  return {
    latitude: (minimumLatitude + maximumLatitude) / 2,
    longitude: (minimumLongitude + maximumLongitude) / 2,
    latitudeDelta: Math.max((maximumLatitude - minimumLatitude) * 1.6, 0.025),
    longitudeDelta: Math.max((maximumLongitude - minimumLongitude) * 1.6, 0.025),
  };
}

export function OrderMap({ orders, showRoute = false }) {
  const map = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const coordinates = useMemo(
    () => [DEFAULT_RESTAURANT.coordinates, ...orders.map((order) => order.address.coordinates).filter(Boolean)],
    [orders],
  );
  const routeCoordinates = useMemo(
    () => [...coordinates, DEFAULT_RESTAURANT.coordinates],
    [coordinates],
  );
  const mappedOrders = useMemo(
    () => orders.filter((order) => order.address.coordinates),
    [orders],
  );

  useEffect(() => {
    if (mapReady && coordinates.length > 1) {
      map.current?.fitToCoordinates(coordinates, {
        edgePadding: MAP_PADDING,
        animated: true,
      });
    }
  }, [coordinates, mapReady]);

  if (!MAPS_API_KEY) {
    return (
      <View style={[styles.container, styles.unavailable]}>
        <Text style={styles.unavailableTitle}>Map preview unavailable</Text>
        <Text style={styles.unavailableText}>
          Add an Android Google Maps API key and rebuild to enable map previews.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={map}
        style={styles.map}
        initialRegion={getInitialRegion(coordinates)}
        onMapReady={() => setMapReady(true)}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {showRoute && orders.length > 0 && (
          <Polyline coordinates={routeCoordinates} strokeColor={colors.deepGold} strokeWidth={4} />
        )}
        <Marker
          coordinate={DEFAULT_RESTAURANT.coordinates}
          title="Ming House"
          description={DEFAULT_RESTAURANT.formatted_address}
        >
          <View style={[styles.marker, styles.restaurantMarker]}>
            <Text style={styles.restaurantMarkerText}>R</Text>
          </View>
        </Marker>
        {mappedOrders.map((order, index) => (
          <Marker
            key={order.order_id}
            coordinate={order.address.coordinates}
            title={`Order #${order.order_id}`}
            description={order.address.formatted_address}
          >
            <View style={[styles.marker, styles.orderMarker]}>
              <Text style={styles.orderMarkerText}>{index + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
      <View style={styles.legend} pointerEvents="none">
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.restaurantDot]} />
          <Text style={styles.legendText}>Restaurant</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.orderDot]} />
          <Text style={styles.legendText}>{showRoute ? 'Stop order' : 'Orders'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 230,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  unavailable: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  unavailableTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  unavailableText: {
    color: colors.muted,
    lineHeight: 20,
    textAlign: 'center',
  },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  restaurantMarker: {
    backgroundColor: colors.black,
  },
  restaurantMarkerText: {
    color: colors.gold,
    fontWeight: '900',
  },
  orderMarker: {
    backgroundColor: colors.gold,
  },
  orderMarkerText: {
    color: colors.black,
    fontWeight: '900',
  },
  legend: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(255, 253, 247, 0.94)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  restaurantDot: {
    backgroundColor: colors.black,
  },
  orderDot: {
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.deepGold,
  },
  legendText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
});
