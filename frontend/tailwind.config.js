/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#087FA5",
          dark: "#066687",
          light: "#E3F2F8",
          soft: "#F0F8FB"
        },
        ink: {
          DEFAULT: "#163547",
          soft: "#4A6A7C",
          faint: "#8AA5B4"
        },
        canvas: "#F4F9FC",
        success: "#0F9D58",
        danger: "#D64545",
        warning: "#C77800"
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Khmer", "Khmer OS", "system-ui", "sans-serif"],
        khmer: ["Noto Sans Khmer", "Khmer OS", "Inter", "sans-serif"],
        display: ["Sora", "Noto Sans Khmer", "Inter", "sans-serif"]
      },
      borderRadius: {
        card: "18px",
        pill: "999px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,53,71,.05), 0 6px 20px -8px rgba(22,53,71,.12)",
        pop: "0 12px 40px -12px rgba(8,127,165,.35)"
      },
      keyframes: {
        fadeUp: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        slideUp: { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } }
      },
      animation: {
        fadeUp: "fadeUp .3s ease both",
        slideUp: "slideUp .25s cubic-bezier(.2,.9,.3,1) both"
      }
    }
  },
  plugins: []
};
