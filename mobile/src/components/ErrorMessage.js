import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

export function ErrorMessage({ message }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.errorBackground,
    borderRadius: 12,
    padding: 14,
  },
  text: {
    color: colors.errorText,
    lineHeight: 20,
  },
});
