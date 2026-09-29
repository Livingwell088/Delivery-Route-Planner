import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme/colors';

export function FormField({ label, multiline = false, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        multiline={multiline}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
  },
  label: {
    color: colors.ink,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 16,
  },
  multiline: {
    minHeight: 76,
    paddingTop: 13,
    textAlignVertical: 'top',
  },
});
