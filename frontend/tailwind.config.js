/** @type {import('tailwindcss').Config} */
import { tokens } from './src/styles/tokens';

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // Sage palette
        'brand-50': tokens.colors.brand50,
        'brand-100': tokens.colors.brand100,
        'brand-300': tokens.colors.brand300,
        'brand-700': tokens.colors.brand700,

        // Semantic surfaces
        background: tokens.colors.background,
        surface: tokens.colors.surface,
        surfaceAlt: tokens.colors.surfaceAlt,

        // Borders
        border: tokens.colors.border,
        borderHover: tokens.colors.borderHover,

        // Text
        textPrimary: tokens.colors.textPrimary,
        textSecondary: tokens.colors.textSecondary,
        textMuted: tokens.colors.textMuted,

        // Interactive
        primary: tokens.colors.primary,
        primaryHover: tokens.colors.primaryHover,
        primarySoft: tokens.colors.primarySoft,

        // Accents
        accent: tokens.colors.accent,
        accentHover: tokens.colors.accentHover,
        accentDim: tokens.colors.accentDim,

        // Semantic
        success: tokens.colors.success,
        warning: tokens.colors.warning,
        error: tokens.colors.error,
        info: tokens.colors.info,

        // Focus
        focusRing: tokens.colors.focusRing,

        // Utility (landing page only)
        white: tokens.colors.white,
        whiteAlt: tokens.colors.whiteAlt,
      },
      fontFamily: {
        display: [tokens.typography.fontDisplay],
        mono: [tokens.typography.fontMono],
        sans: [tokens.typography.fontSans],
      },
      borderRadius: {
        sm: tokens.radius.sm,
        md: tokens.radius.md,
        lg: tokens.radius.lg,
        full: tokens.radius.full,
      },
      boxShadow: {
        sm: tokens.shadows.sm,
        md: tokens.shadows.md,
        lg: tokens.shadows.lg,
      },
      spacing: {
        xs: tokens.spacing.xs,
        sm: tokens.spacing.sm,
        md: tokens.spacing.md,
        lg: tokens.spacing.lg,
        xl: tokens.spacing.xl,
      },
      maxWidth: {
        container: tokens.spacing.containerMax,
      },
    },
  },
  plugins: [],
};
