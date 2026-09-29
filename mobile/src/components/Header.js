import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

export function Header({ screen, onNavigate, orderCount }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => onNavigate('home')}>
        <Text style={styles.brand}>RouteRunner</Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={() => onNavigate('orders')}>
          <Text style={[styles.link, screen === 'orders' && styles.activeLink]}>
            Orders ({orderCount})
          </Text>
        </Pressable>
        <Pressable onPress={() => onNavigate('settings')}>
          <Text style={[styles.link, screen === 'settings' && styles.activeLink]}>
            Settings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.deepGold,
    backgroundColor: colors.black,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 18,
  },
  link: {
    color: colors.cream,
    fontWeight: '600',
  },
  activeLink: {
    color: colors.gold,
  },
});
