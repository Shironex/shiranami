/**
 * OKLCH to sRGB hex, for the token build. React Native has no OKLCH parser,
 * so the desktop values are converted once and the app reads plain hex.
 * Formulas from Björn Ottosson's OKLab reference.
 */

function toSrgbChannel(linear) {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded =
    clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

function hexByte(value) {
  return value.toString(16).padStart(2, '0');
}

/**
 * @param {number} l lightness, 0 to 1
 * @param {number} c chroma
 * @param {number} h hue in degrees
 * @param {number} [alpha] 0 to 1; below 1 adds an alpha byte (#rrggbbaa)
 * @returns {string}
 */
function oklchToHex(l, c, h, alpha = 1) {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  const rgb = [r, g, bl].map(toSrgbChannel).map(hexByte).join('');
  return alpha < 1 ? `#${rgb}${hexByte(Math.round(alpha * 255))}` : `#${rgb}`;
}

module.exports = { oklchToHex };
