import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

const NAVIGATION_OPTIONS = [
  { value: 'google', label: 'Google Maps' },
  { value: 'apple', label: 'Apple Maps' },
];

export function SettingsScreen({ value, onChange }) {
  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.eyebrow}>PREFERENCES</Text>
      <Text style={commonStyles.title}>Navigation app</Text>
      <Text style={commonStyles.subtitle}>
        RouteRunner will open each confirmed stop using this app.
      </Text>
      {NAVIGATION_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.option, value === option.value && styles.selected]}
          onPress={() => onChange(option.value)}
        >
          <Text style={commonStyles.cardTitle}>{option.label}</Text>
          <Text style={styles.radio}>{value === option.value ? '●' : '○'}</Text>
        </Pressable>
      ))}
      <Text style={commonStyles.hint}>
        Apple Maps links work best on iPhone. Your choice is saved on this device.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  option: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selected: {
    borderColor: colors.deepGold,
    borderWidth: 2,
    backgroundColor: colors.successBackground,
  },
  radio: {
    color: colors.deepGold,
    fontSize: 22,
  },
});
