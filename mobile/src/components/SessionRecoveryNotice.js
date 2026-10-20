import { Pressable, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function SessionRecoveryNotice({ status, onRetryRestore, onStartNew, onRetrySave }) {
  if (!['restore_failed', 'save_failed'].includes(status.kind)) return null;
  const restoring = status.kind === 'restore_failed';
  return <View style={{ padding: 14, gap: 8, backgroundColor: colors.cream }}>
    <Text accessibilityLiveRegion="polite">{restoring ? 'Saved orders could not be loaded. Retry before scanning.'
      : 'Orders are available now but have not been saved for a restart.'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
      <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={restoring ? onRetryRestore : onRetrySave}>
        <Text style={{ color: colors.deepGold, fontWeight: '700' }}>{restoring ? 'Retry loading' : 'Retry saving'}</Text>
      </Pressable>
      {restoring && <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={onStartNew}>
        <Text style={{ color: colors.errorText, fontWeight: '700' }}>Start new run</Text>
      </Pressable>}
    </View>
  </View>;
}
