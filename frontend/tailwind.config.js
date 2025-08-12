// frontend/tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mist: "var(--color-mist)",         // background
        ink: "var(--color-ink)",           // primary text
        vein: "var(--color-vein)",         // muted gray-taupe
        lantern: "var(--color-lantern)",   // warm glow
        ripple: "var(--color-ripple)",     // accent blue
        spool: "var(--color-spool)",       // accent lavender
        plum: "var(--color-plum)",         // moody plum
        border: "var(--color-border)",     // line work
        surface: "var(--color-surface)",   // card base
        bg: "var(--color-bg)",             // legacy token
        text: "var(--color-text)",         // legacy token
        muted: "var(--color-muted)",
        accent: "var(--color-accent)",
        accent2: "var(--color-accent-2)",
      },
      fontFamily: {
        thread: "var(--font-thread)",
        glow: "var(--font-glow)",
        echo: "var(--font-echo)",
        sans: "var(--font-sans)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        card: "var(--radius-card)",
        input: "var(--radius-input)",
        button: "var(--radius-button)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        6: "var(--space-6)",
      },
    },
  },
  corePlugins: { preflight: false },
  plugins: [],
};
