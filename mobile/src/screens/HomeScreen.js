import * as Location from 'expo-location';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useState } from 'react';

import { AppButton } from '../components/AppButton';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function HomeScreen({ capturedReceipt, onMock, onScan }) {
  const [locationStatus, setLocationStatus] = useState('not requested');
  const [testMode, setTestMode] = useState(false);

  const askLocation = async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setLocationStatus(result.granted ? 'granted' : 'denied');
  };

  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.eyebrow}>NEW DELIVERY RUN</Text>
      <Text style={commonStyles.title}>Scan a receipt</Text>
      <Text style={commonStyles.subtitle}>
        Photograph one receipt at a time. Keep the address and order time inside the frame.
      </Text>
      <View style={styles.cameraFrame}>
        {capturedReceipt ? (
          <Image source={{ uri: capturedReceipt.uri }} style={styles.receiptPreview} resizeMode="contain" />
        ) : (
          <View style={styles.permissionPanel}>
            <Text style={styles.permissionIcon}>▣</Text>
            <Text style={commonStyles.cardTitle}>Receipt scanner ready</Text>
            <Text style={commonStyles.muted}>Capture and review a cropped receipt image.</Text>
          </View>
        )}
      </View>
      <AppButton label={testMode ? 'Add mock receipt' : 'Scan receipt'} onPress={testMode ? onMock : onScan} />
      <View style={styles.testModeRow}>
        <View style={styles.testModeCopy}>
          <Text style={commonStyles.cardTitle}>Test mode</Text>
          <Text style={commonStyles.muted}>Substitute mock order data instead of opening the camera.</Text>
        </View>
        <Switch value={testMode} onValueChange={setTestMode} trackColor={{ true: colors.gold }} />
      </View>
      <Pressable style={styles.locationButton} onPress={askLocation}>
        <Text style={styles.locationButtonText}>Location permission: {locationStatus}</Text>
      </Pressable>
      <Text style={commonStyles.hint}>
        {capturedReceipt ? 'Receipt image is ready for OCR in the next step.' : 'Test mode remains available without camera access.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cameraFrame: {
    height: 330,
    backgroundColor: colors.cream,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  receiptPreview: { width: '100%', height: '100%', backgroundColor: colors.black },
  permissionPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  permissionIcon: {
    fontSize: 44,
    color: colors.deepGold,
  },
  locationButton: {
    padding: 12,
    alignItems: 'center',
  },
  locationButtonText: {
    color: colors.deepGold,
    fontWeight: '700',
  },
  testModeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  testModeCopy: { flex: 1, gap: 4 },
});
