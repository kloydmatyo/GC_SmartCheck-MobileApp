/**
 * components/ui/UIComponents.tsx
 *
 * Reusable UI building blocks used across all screens.
 * All styling uses the green #00a550 palette from theme.ts
 * to match the existing index.tsx design.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../../constants/theme';

// ── SCREEN HEADER ────────────────────────────────────────────────
interface HeaderProps {
  title: string;
  onBack?: () => void;
  rightLabel?: string;
  onRightPress?: () => void;
}
export function ScreenHeader({ title, onBack, rightLabel, onRightPress }: HeaderProps) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.headerSide} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textDark} />
        </TouchableOpacity>
      ) : <View style={styles.headerSide} />}

      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>

      {rightLabel ? (
        <TouchableOpacity onPress={onRightPress} style={styles.headerSide}>
          <Text style={styles.headerRight}>{rightLabel}</Text>
        </TouchableOpacity>
      ) : <View style={styles.headerSide} />}
    </View>
  );
}

// ── PRIMARY BUTTON ───────────────────────────────────────────────
interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  variant?: 'solid' | 'outline';
}
export function PrimaryButton({
  label, onPress, icon, loading, disabled, style, variant = 'solid',
}: PrimaryButtonProps) {
  const isOutline = variant === 'outline';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.primaryBtn,
        isOutline && styles.primaryBtnOutline,
        (disabled || loading) && styles.primaryBtnDisabled,
        style,
      ]}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? COLORS.primaryMid : COLORS.white} size="small" />
      ) : (
        <View style={styles.btnRow}>
          {icon && (
            <Ionicons
              name={icon as any}
              size={18}
              color={isOutline ? COLORS.primaryMid : COLORS.white}
              style={{ marginRight: 6 }}
            />
          )}
          <Text style={[styles.primaryBtnText, isOutline && { color: COLORS.primaryMid }]}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── SEARCH BAR ───────────────────────────────────────────────────
interface SearchBarProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}
export function SearchBar({ value, onChangeText, placeholder = 'Search...' }: SearchBarProps) {
  return (
    <View style={styles.searchContainer}>
      <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        style={styles.searchInput}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── SCORE BADGE ──────────────────────────────────────────────────
interface ScoreBadgeProps { score: number; total: number }
export function ScoreBadge({ score, total }: ScoreBadgeProps) {
  const pct = total > 0 ? score / total : 0;
  const bg  = pct >= 0.75 ? COLORS.scoreHigh
            : pct >= 0.50 ? COLORS.scoreMid
            : COLORS.scoreLow;
  return (
    <View style={[styles.scoreBadge, { backgroundColor: bg }]}>
      <Text style={styles.scoreBadgeText}>{score}/{total}</Text>
    </View>
  );
}

// ── EMPTY STATE ──────────────────────────────────────────────────
interface EmptyStateProps { icon?: string; message: string; sub?: string }
export function EmptyState({ icon = 'folder-open-outline', message, sub }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={52} color={COLORS.textMuted} />
      <Text style={styles.emptyMsg}>{message}</Text>
      {sub && <Text style={styles.emptySub}>{sub}</Text>}
    </View>
  );
}

// ── TOGGLE TABS ──────────────────────────────────────────────────
interface ToggleTabsProps {
  tabs: string[];
  active: number;
  onChange: (i: number) => void;
}
export function ToggleTabs({ tabs, active, onChange }: ToggleTabsProps) {
  return (
    <View style={styles.toggleRow}>
      {tabs.map((tab, i) => (
        <TouchableOpacity
          key={tab}
          style={[styles.toggleTab, i === active && styles.toggleTabActive]}
          onPress={() => onChange(i)}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === active }}
        >
          <Text style={[styles.toggleTabText, i === active && styles.toggleTabTextActive]}>
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── STATUS BADGE ─────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const bg = status === 'Active'    ? COLORS.statusActive
           : status === 'Completed' ? COLORS.statusComplete
           : COLORS.statusUpcoming;
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={styles.statusText}>{status}</Text>
    </View>
  );
}

// ── STYLES ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
    }),
  },
  headerSide:   { width: 60 },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.textDark },
  headerRight:  { color: COLORS.primaryMid, fontSize: FONT_SIZE.sm, textAlign: 'right', fontWeight: '600' },

  // Primary button
  primaryBtn: {
    backgroundColor: COLORS.primaryMid, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4 },
    }),
  },
  primaryBtnOutline:  { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.primaryMid },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText:     { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: '600' },
  btnRow:             { flexDirection: 'row', alignItems: 'center' },

  // Search bar
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONT_SIZE.md, color: COLORS.textDark, padding: 0 },

  // Score badge
  scoreBadge:     { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3 },
  scoreBadgeText: { color: COLORS.white, fontSize: FONT_SIZE.xs, fontWeight: '700' },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl },
  emptyMsg:   { color: COLORS.textMid, fontSize: FONT_SIZE.md, fontWeight: '600', marginTop: SPACING.md, textAlign: 'center' },
  emptySub:   { color: COLORS.textMuted, fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, textAlign: 'center' },

  // Toggle tabs (Student List / Recent Quizzes)
  toggleRow:           { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: RADIUS.xl, padding: 3 },
  toggleTab:           { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.xl, alignItems: 'center' },
  toggleTabActive:     { backgroundColor: COLORS.primaryMid },
  toggleTabText:       { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontWeight: '600' },
  toggleTabTextActive: { color: COLORS.white },

  // Status badge
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.sm },
  statusText:  { color: COLORS.white, fontSize: FONT_SIZE.xs, fontWeight: '600', includeFontPadding: false },
});