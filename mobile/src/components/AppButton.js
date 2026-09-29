import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../theme/colors';

export function AppButton({ label, onPress, disabled = false, secondary = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}
    >
      <Text style={[styles.text, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  text: {
    color: colors.black,
    fontWeight: '800',
    fontSize: 16,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.deepGold,
  },
  secondaryText: {
    color: colors.deepGold,
  },
  disabled: {
    opacity: 0.45,
  },
});
