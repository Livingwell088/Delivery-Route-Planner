import { StyleSheet } from 'react-native';

import { colors } from './colors';

export const commonStyles = StyleSheet.create({
  content: {
    padding: 22,
    paddingBottom: 48,
    gap: 14,
  },
  eyebrow: {
    color: colors.deepGold,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.4,
    marginTop: 8,
  },
  title: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 34,
    letterSpacing: -1,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 6,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  muted: {
    color: colors.muted,
    lineHeight: 20,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  orderDetails: {
    flex: 1,
    gap: 4,
  },
});
