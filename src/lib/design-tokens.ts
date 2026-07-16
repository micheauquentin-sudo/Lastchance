/**
 * Design Tokens — Direction Artistique LastChance
 * Premium, Modern, Fresh, Playful, Slightly Cartoon
 */

export const colors = {
  // Primary Brand — Warm, Energetic, Premium
  primary: {
    base: "#E17A5F", // Coral/Orange Chaud
    hover: "#FF6B35", // Orange Vif
    light: "#F5A98A", // Coral Light (backgrounds)
    dark: "#C65A42", // Coral Dark (text on light)
  },

  // Secondary — Fresh, Modern, Playful
  secondary: {
    base: "#4ECDC4", // Teal Moderne
    light: "#A8E6DC", // Teal Clair (backgrounds)
    dark: "#2BA29F", // Teal Dark (text)
  },

  // Neutrals — Warm, Clean, Premium
  background: {
    primary: "#FBF8F5", // Warm White/Beige Crème
    secondary: "#F0EDE8", // Slightly warmer
    tertiary: "#E8E6E1", // Light Gray
  },

  text: {
    primary: "#1A1A2E", // Dark Blue-Black (headlines, primary text)
    secondary: "#8B8B9F", // Warm Gray (secondary text)
    light: "#AEAEC0", // Light Gray (disabled, hints)
    inverse: "#FBF8F5", // For dark backgrounds
  },

  border: {
    light: "#E8E6E1", // Light borders
    medium: "#D9D5CD", // Medium borders
    focus: "#E17A5F", // Focus rings in primary color
  },

  // Functional
  success: "#6BCF7F",
  caution: "#FFB84D",
  error: "#E85D6D",

  // Wheel Colors (distinct, coherent, NO change during rotation)
  wheel: {
    slot1: "#E17A5F", // Primary Orange
    slot2: "#4ECDC4", // Secondary Teal
    slot3: "#6BCF7F", // Success Green
    slot4: "#FFB84D", // Caution Amber
    slot5: "#9B8FFF", // Lavender (soft, not neon)
    slot6: "#FF9F7B", // Coral Light
  },
} as const;

export const typography = {
  // Font Families
  fonts: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: '"Georgia", "Garamond", serif',
    mono: '"JetBrains Mono", "Courier New", monospace',
  },

  // Font Sizes
  sizes: {
    xs: "12px",
    sm: "14px",
    base: "16px",
    lg: "18px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "32px",
    "4xl": "40px",
    "5xl": "48px",
    "6xl": "60px",
  },

  // Line Heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    spacious: 2,
  },

  // Letter Spacing
  letterSpacing: {
    tight: "-0.02em",
    normal: "0em",
    wide: "0.02em",
    wider: "0.05em",
  },

  // Font Weights
  weights: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },

  // Preset Styles
  styles: {
    // Headlines
    h1: {
      size: "48px",
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
      description: "Hero Headlines",
    },
    h2: {
      size: "40px",
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: "-0.02em",
      description: "Section Headlines",
    },
    h3: {
      size: "32px",
      weight: 600,
      lineHeight: 1.3,
      letterSpacing: "-0.01em",
      description: "Subsection Headlines",
    },
    h4: {
      size: "24px",
      weight: 600,
      lineHeight: 1.4,
      description: "Card Headlines",
    },
    h5: {
      size: "20px",
      weight: 600,
      lineHeight: 1.4,
      description: "Small Headlines",
    },

    // Body
    body: {
      size: "16px",
      weight: 400,
      lineHeight: 1.6,
      description: "Primary Body Text",
    },
    bodySmall: {
      size: "14px",
      weight: 400,
      lineHeight: 1.6,
      description: "Secondary Body Text",
    },

    // Labels & Meta
    label: {
      size: "12px",
      weight: 600,
      lineHeight: 1.5,
      letterSpacing: "0.05em",
      description: "Labels & Tags",
    },

    // CTA
    cta: {
      size: "16px",
      weight: 600,
      lineHeight: 1.5,
      description: "Call-to-Action Buttons",
    },
  },
} as const;

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  "2xl": "32px",
  "3xl": "48px",
  "4xl": "64px",
  "5xl": "80px",
  "6xl": "96px",
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  full: "9999px",
} as const;

export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.1)",
  inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)",
  // Soft shadows for premium feel
  soft: "0 8px 16px -2px rgba(225, 122, 95, 0.08)",
  softMd: "0 12px 24px -3px rgba(225, 122, 95, 0.12)",
} as const;

export const animations = {
  durations: {
    instant: "100ms",
    fast: "150ms",
    base: "200ms",
    slow: "300ms",
    slower: "500ms",
    slowest: "800ms",
  },
  easing: {
    // Smooth, organic, human-paced
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    // Playful bounce
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    // Smooth entrance
    smoothEntry: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    // Smooth exit
    smoothExit: "cubic-bezier(0.55, 0.06, 0.68, 0.19)",
  },
} as const;

// Helper function to generate CSS variables
export const generateCSSVariables = () => {
  const vars: Record<string, string> = {};

  // Colors
  Object.entries(colors).forEach(([key, value]) => {
    if (typeof value === "object") {
      Object.entries(value).forEach(([subKey, subValue]) => {
        vars[`--color-${key}-${subKey}`] = subValue;
      });
    } else {
      vars[`--color-${key}`] = value;
    }
  });

  // Typography
  Object.entries(typography.fonts).forEach(([key, value]) => {
    vars[`--font-${key}`] = value;
  });

  // Spacing
  Object.entries(spacing).forEach(([key, value]) => {
    vars[`--spacing-${key}`] = value;
  });

  // Radius
  Object.entries(radius).forEach(([key, value]) => {
    vars[`--radius-${key}`] = value;
  });

  // Animations
  Object.entries(animations.durations).forEach(([key, value]) => {
    vars[`--duration-${key}`] = value;
  });

  Object.entries(animations.easing).forEach(([key, value]) => {
    vars[`--ease-${key}`] = value;
  });

  return vars;
};
