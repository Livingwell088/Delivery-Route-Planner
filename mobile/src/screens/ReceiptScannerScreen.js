import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { cropReceiptImage } from '../services/receiptImage';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function ReceiptScannerScreen({ onCancel, onComplete }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const camera = useRef(null);

  const capture = async () => {
    if (!cameraReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 1 });
      if (!photo) throw new Error('The camera did not return a photo.');
      setCapturedImage(await cropReceiptImage(photo));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to capture this receipt.');
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    setCapturedImage(null);
    setError(null);
    setCameraReady(false);
  };

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={colors.deepGold} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionPanel}>
        <Text style={commonStyles.title}>Camera access needed</Text>
        <Text style={commonStyles.subtitle}>RouteRunner needs camera access to photograph receipts.</Text>
        <AppButton label="Allow camera" onPress={requestPermission} />
        <AppButton label="Cancel" onPress={onCancel} secondary />
      </View>
    );
  }

  if (capturedImage) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Review receipt</Text>
        <Text style={styles.instructions}>Make sure the address and order time are sharp and fully visible.</Text>
        <View style={styles.previewFrame}>
          <Image source={{ uri: capturedImage.uri }} style={styles.preview} resizeMode="contain" />
        </View>
        <View style={styles.actions}>
          <AppButton label="Retake" onPress={retake} secondary />
          <AppButton label="Use photo" onPress={() => onComplete(capturedImage)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.scanner}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        onCameraReady={() => setCameraReady(true)}
        onMountError={(event) => setError(event.message)}
      />
      <View style={styles.shade} pointerEvents="none">
        <View style={styles.scanBoundary} />
      </View>
      <View style={styles.topBar}>
        <Pressable onPress={onCancel} hitSlop={12}><Text style={styles.controlText}>Cancel</Text></Pressable>
        <Text style={styles.cameraTitle}>Fit receipt inside frame</Text>
        <View style={styles.controlSpacer} />
      </View>
      <View style={styles.bottomBar}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.cameraHint}>Keep the receipt flat and avoid glare.</Text>
        <Pressable
          accessibilityLabel="Capture receipt"
          disabled={!cameraReady || busy}
          onPress={capture}
          style={[styles.shutter, (!cameraReady || busy) && styles.disabled]}
        >
          {busy ? <ActivityIndicator color={colors.black} /> : <View style={styles.shutterInner} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 22, paddingBottom: 34, gap: 14, backgroundColor: colors.parchment },
  scanner: { flex: 1, backgroundColor: colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permissionPanel: { flex: 1, padding: 30, justifyContent: 'center', gap: 16, backgroundColor: colors.parchment },
  heading: { color: colors.ink, fontWeight: '800', fontSize: 30 },
  instructions: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  previewFrame: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.black },
  preview: { width: '100%', height: '100%' },
  actions: { gap: 10 },
  shade: { position: 'absolute', top: '5%', left: '8%', width: '84%', height: '90%' },
  scanBoundary: { flex: 1, borderWidth: 3, borderColor: colors.gold, borderRadius: 16 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.62)' },
  cameraTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  controlText: { color: '#FFFFFF', fontWeight: '700', width: 60 },
  controlSpacer: { width: 60 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, paddingBottom: 28, alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.68)' },
  cameraHint: { color: '#FFFFFF', fontSize: 14 },
  error: { color: '#FFD0C8', fontWeight: '700', paddingHorizontal: 20, textAlign: 'center' },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.gold },
  disabled: { opacity: 0.5 },
});
