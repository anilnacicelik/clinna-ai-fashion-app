/**
 * CLINNA AI — Design System
 * Aesthetic: Archived fashion editorial. Raw type. Void-black space.
 * Reference: Rick Owens showroom lighting / Raf Simons lookbook grid
 */

export const Colors = {
  // Core void
  void:       '#080808',   // true near-black background
  surface:    '#111111',   // card / sheet surface
  elevated:   '#1A1A1A',   // elevated surface (modals, overlays)
  border:     '#242424',   // subtle borders
  borderHigh: '#333333',   // active/hover borders

  // Typography scale
  white:      '#F2F0EB',   // warm off-white — NOT pure white (too harsh)
  muted:      '#888880',   // secondary text
  faint:      '#444440',   // placeholder / disabled

  // Verdicts — deliberate, muted tones (not traffic-light obvious)
  authentic:  '#C8D5B9',   // sage green — authentic
  fake:       '#D4A5A0',   // dusty rose — fake
  uncertain:  '#C4B89A',   // warm sand — uncertain

  // Accent
  accent:     '#E8E0D0',   // warm cream — primary interactive
  accentDim:  '#2A2820',   // accent tint background

  // Utility
  overlay:    'rgba(8,8,8,0.85)',
  shimmer1:   '#141414',
  shimmer2:   '#1E1E1E',
};

export const Typography = {
  // Display — editorial headers
  // Note: Custom fonts in React Native require expo-font or react-native-vector-icons.
  // For now using system serif + monospace pairing; in production I'd recommend "Freight Display" or "Canela".
  displayFont:  'Georgia',       // serif — weight / gravitas
  bodyFont:     'Courier New',   // monospace — technical / archive feel
  labelFont:    'System',        // system font for UI labels only

  size: {
    xs:   10,
    sm:   12,
    base: 14,
    md:   16,
    lg:   20,
    xl:   28,
    xxl:  38,
    hero: 52,
  },

  weight: {
    light:   '300' as const,
    regular: '400' as const,
    medium:  '500' as const,
    bold:    '700' as const,
  },

  tracking: {
    wide:    2,    // letterSpacing for caps labels
    wider:   4,
    tight:  -0.5,
  },
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  40,
  xxl: 64,
};

export const Radius = {
  sm:  4,
  md:  8,
  lg:  16,
  pill: 100,
};

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
};

// --- FULL THEME PACKAGE FOR SILENT LUXURY SCREENS ---

export const C = {
  black: '#000000',
  white: '#FFFFFF',
  faint: '#222222', 
  darkGray: '#111111',
  gray: '#888888',
  grey400: '#9CA3AF', // fine grey
  grey600: '#4B5563', // dark grey
  red: '#FF3B30'
};

export const F = {
  brand: 'MissFajardose', 
  mono: 'Courier New', 
  sans: 'System'
};

export const FS = {
  xxs: 10, // extra-small font
  xs: 12,
  sm: 14,
  base: 16, // base font size
  md: 18,
  lg: 20,
  xl: 28, 
  xxl: 36
};

export const SP = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
}; // <-- The missing bracket

