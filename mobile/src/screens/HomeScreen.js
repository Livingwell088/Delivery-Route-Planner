import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRef, useState } from 'react';

import { AppButton } from '../components/AppButton';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function HomeScreen({ onMock }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locationStatus, setLocationStatus] = useState('not requested');
  const [cameraReady, setCameraReady] = useState(false);
  const camera = useRef(null);

  const capture = async () => {
    try {
      if (permission?.granted) {
        if (!cameraReady) {
          Alert.alert('Camera is starting', 'Wait a moment and try again.');
          return;
        }
        await camera.current?.takePictureAsync({ quality: 0.3 });
      }
      onMock();
    } catch {
      Alert.alert('Could not capture photo', 'Please wait for the camera preview and try again.');
    }
  };

  const askLocation = async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setLocationStatus(result.granted ? 'granted' : 'denied');
  };

  const captureLabel = permission?.granted
    ? cameraReady ? 'Capture receipt' : 'Starting camera...'
    : 'Add mock receipt';

  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.eyebrow}>NEW DELIVERY RUN</Text>
      <Text style={commonStyles.title}>Scan a receipt</Text>
      <Text style={commonStyles.subtitle}>
        Photograph one receipt at a time. Mock extraction is enabled for Phase 4.
      </Text>
      <View style={styles.cameraFrame}>
        {permission?.granted ? (
          <CameraView
            ref={camera}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => Alert.alert('Camera unavailable', event.message)}
          />
        ) : (
          <View style={styles.permissionPanel}>
            <Text style={styles.permissionIcon}>▣</Text>
            <Text style={commonStyles.cardTitle}>Camera access needed</Text>
            <Text style={commonStyles.muted}>Allow access to photograph restaurant receipts.</Text>
            <AppButton label="Allow camera" onPress={requestPermission} />
          </View>
        )}
      </View>
      <AppButton
        label={captureLabel}
        onPress={capture}
        disabled={permission?.granted && !cameraReady}
      />
      <Pressable style={styles.locationButton} onPress={askLocation}>
        <Text style={styles.locationButtonText}>Location permission: {locationStatus}</Text>
      </Pressable>
      <Text style={commonStyles.hint}>
        You can continue with mock data even if camera access is denied.
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
  camera: {
    flex: 1,
  },
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
});
