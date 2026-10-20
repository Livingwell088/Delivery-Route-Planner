import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function StopOrderControls({ orderId, index, count, onMove, onRemove }) {
  return <View style={styles.controls}>
    {[[-1, 'Move up', index === 0], [1, 'Move down', index === count - 1]].map(([direction, label, disabled]) => (
      <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`${label}: order ${orderId}`}
        accessibilityState={{ disabled }} disabled={disabled} onPress={() => onMove(orderId, direction)}
        style={[styles.button, disabled && styles.disabled]}>
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    ))}
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove order ${orderId}`}
      onPress={() => onRemove(orderId)} style={styles.button}>
      <Text style={styles.remove}>Remove</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  button: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  text: { color: colors.deepGold, fontWeight: '700', fontSize: 13 },
  remove: { color: colors.errorText, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: .4 },
});
