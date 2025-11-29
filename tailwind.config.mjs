/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      fontFamily: {
        grotesk: ["Grotesk", "sans-serif"],
      },
      fontWeight: {
        regular: 400,
        medium: 500,
      },
      colors: {
        // Velvet & Neon Design System
        'velvet-black': 'var(--velvet-black)',
        'velvet-charcoal': 'var(--velvet-charcoal)',
        'velvet-purple': 'var(--velvet-purple)',
        'velvet-midnight': 'var(--velvet-midnight)',
        'neon-green': 'var(--neon-green)',
        'neon-cyan': 'var(--neon-cyan)',
        'neon-yellow': 'var(--neon-yellow)',
        'neon-orange': 'var(--neon-orange)',
        'neon-pink': 'var(--neon-pink)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        // Legacy compatibility
        green: "var(--green)",
        black: "var(--black)",
        dark: "var(--dark)",
        gray: "var(--gray)",
        white: "var(--white)",
      },
    },
  },
  plugins: [],
};
