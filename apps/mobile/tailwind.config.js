const { hairlineWidth } = require('nativewind/theme');
const { colors } = require('./theme/colors.json');
const { fontFamily } = require('./theme/fonts');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Generated from theme/palette.js; see `pnpm tokens`.
      colors,
      fontFamily: Object.fromEntries(
        Object.entries(fontFamily).map(([key, family]) => [key, [family]])
      ),
      borderRadius: {
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        panel: '24px',
        sheet: '28px',
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require('tailwindcss-animate')],
};
