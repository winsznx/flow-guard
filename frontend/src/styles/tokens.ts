/**
 * FlowGuard Design Tokens
 * Sage Palette Theme from Color Hunt (#F1F3E0, #D2DCB6, #A1BC98, #778873)
 * Source of truth for all design values
 *
 * RULES:
 * - ALL colors MUST map to Sage palette values ONLY
 * - NO hardcoded hex outside Sage palette
 * - NO bg-white or text-black (use semantic aliases)
 */

export const tokens = {
    colors: {
        // Brand palette (Color Hunt Sage theme) - SINGLE SOURCE OF TRUTH
        brand50: '#F1F3E0',  // Lightest - main backgrounds
        brand100: '#D2DCB6', // Light - secondary surfaces
        brand300: '#A1BC98', // Mid - borders, accents
        brand700: '#778873', // Dark - primary actions

        // Utility colors - Now used for app surfaces
        white: '#FFFFFF',    // Pure white - app background and cards
        whiteAlt: '#F8F9FA', // Very light gray - subtle backgrounds

        // App surfaces (clean white design)
        background: '#FFFFFF',   // Main app background (clean white)
        surface: '#FFFFFF',      // Card backgrounds (clean white)
        surfaceAlt: '#F1F3E0',   // Alternate: sidebars, subtle panels (brand50 - light sage tint)

        // Borders
        border: '#A1BC98',       // Borders, dividers (brand300)
        borderHover: '#778873',  // Hover state (brand700)

        // Text (neutral derivatives for readability)
        textPrimary: '#1F2A1F',  // Deep neutral green-black
        textSecondary: '#3B4A3B', // Muted but readable
        textMuted: '#556255',     // Very muted (placeholders, disabled)

        // Interactive states
        primary: '#778873',       // Primary buttons, CTAs (brand700)
        primaryHover: '#6A7A66',  // Hover state (darker brand700)
        primarySoft: '#D2DCB6',   // Soft buttons, badges (brand100)

        // Accents
        accent: '#A1BC98',        // Accent elements (brand300)
        accentHover: '#778873',   // Accent hover (brand700)
        accentDim: 'rgba(161, 188, 152, 0.1)', // Soft backgrounds

        // Semantic (mapped to palette - NO external colors)
        success: '#778873',  // Success states (brand700)
        warning: '#A1BC98',  // Warning states (brand300 - differentiate via icons)
        error: '#778873',    // Error states (brand700 - differentiate via icons)
        info: '#A1BC98',     // Info states (brand300)

        // Focus ring
        focusRing: '#A1BC98', // Focus indicators (brand300)
    },

    spacing: {
        xs: '0.5rem',    // 8px
        sm: '1rem',      // 16px
        md: '1.5rem',    // 24px
        lg: '2rem',      // 32px
        xl: '4rem',      // 64px
        containerMax: '1280px',
    },

    radius: {
        sm: '2px',
        md: '4px',
        lg: '8px',
        full: '9999px',
    },

    typography: {
        fontDisplay: "'DM Serif Display', serif",
        fontMono: "'IBM Plex Mono', monospace",
        fontSans: "'IBM Plex Sans', sans-serif",
    },

    shadows: {
        sm: '0 1px 2px rgba(119, 136, 115, 0.05)',
        md: '0 4px 6px -1px rgba(119, 136, 115, 0.08)',
        lg: '0 10px 15px -3px rgba(119, 136, 115, 0.10)',
    },
} as const;

export type Tokens = typeof tokens;
