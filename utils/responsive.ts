/**
 * responsive.ts
 * Utility for making the app responsive across ALL devices:
 *
 * ✅ Android phones (small, normal, large)
 * ✅ Android tablets
 * ✅ iPhones (SE, 14, 14 Pro Max)
 * ✅ iPads (Mini, Air, Pro)
 *
 * 
 */

import { Dimensions, PixelRatio, Platform, StatusBar } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base design was made for a 390px wide phone (iPhone 14)
const BASE_WIDTH = 390;

/**
 * Is this a tablet?
 * Android tablets and iPads are generally 600px+ wide
 */
export const isTablet = SCREEN_WIDTH >= 600;
export const isLargeTablet = SCREEN_WIDTH >= 900;
export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';

// Scale ratio based on actual screen width vs base width
const scale = SCREEN_WIDTH / BASE_WIDTH;

/**
 * rs — Responsive Size
 * Use for: icon sizes, border radius, image sizes, component widths/heights
 * Caps scaling on tablets so things don't get too large
 */
export const rs = (size: number): number => {
  const maxScale = isLargeTablet ? 1.3 : isTablet ? 1.45 : scale;
  return Math.round(PixelRatio.roundToNearestPixel(size * Math.min(scale, maxScale)));
};

/**
 * rf — Responsive Font
 * Use for: all fontSize values
 * Uses a gentler scale than rs() — text shouldn't be huge on tablets
 *
 * Android note: Respects user's system font size setting via PixelRatio.getFontScale()
 * We intentionally ignore system font scale for layout consistency —
 * if you want to respect it, remove the division below.
 */
export const rf = (size: number): number => {
  const fontScale = isLargeTablet ? 1.2 : isTablet ? 1.3 : scale;
  const scaledSize = size * Math.min(scale, fontScale);
  // On Android, PixelRatio.getFontScale() can be > 1 if user has large text enabled
  // We normalize it to avoid huge text breaking layouts
  return Math.round(scaledSize / PixelRatio.getFontScale());
};

/**
 * rp — Responsive Padding / Margin
 * Use for: all padding and margin values
 */
export const rp = (size: number): number => rs(size);

/**
 * rw — Responsive Width (percentage-based)
 * Use for: widths that should be a % of the screen
 * e.g. rw(100) = full screen width, rw(50) = half screen
 */
export const rw = (percent: number): number => (SCREEN_WIDTH * percent) / 100;

/**
 * rh — Responsive Height (percentage-based)
 * Use for: heights that should be a % of the screen
 */
export const rh = (percent: number): number => (SCREEN_HEIGHT * percent) / 100;

/**
 * Android status bar height
 * On iOS this is handled by SafeAreaView automatically.
 * On Android you sometimes need to add it manually.
 */
export const androidStatusBarHeight = isAndroid ? StatusBar.currentHeight ?? 0 : 0;

/**
 * horizontalPadding
 * Standard side padding — larger on tablets for better readability
 */
export const horizontalPadding = isTablet ? rp(32) : rp(16);

/**
 * maxWidthStyle
 * On tablets, content shouldn't stretch edge to edge.
 * Wrap your content views with this to center + cap width.
 *
 * Usage:
 *   <View style={[styles.myView, maxWidthStyle]}>
 */
export const maxWidthStyle = isTablet
  ? {
      maxWidth: 700,
      alignSelf: 'center' as const,
      width: '100%' as const,
    }
  : {};

/**
 * shadowStyle
 * Android uses `elevation` for shadows.
 * iOS uses shadowColor, shadowOffset, shadowOpacity, shadowRadius.
 * This gives you the right shadow for each platform.
 *
 * Usage:
 *   <View style={[styles.card, shadowStyle(4)]}>
 */
export const shadowStyle = (elevation: number = 4) =>
  Platform.select({
    android: {
      elevation,
    },
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: elevation / 2 },
      shadowOpacity: 0.12,
      shadowRadius: elevation,
    },
  });