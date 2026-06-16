import { create } from 'storybook/theming/create';

/*
 * Shiranami-branded Storybook theme — mirrors the app's default "Midnight Lofi
 * Cafe" dark palette (src/styles/globals.css :root). The app's tokens are oklch;
 * Storybook's theme API (emotion) takes plain color strings, so each value below
 * is the sRGB-hex equivalent of its oklch source (noted inline). Shared by the
 * manager chrome (manager.ts) and the Docs pages (preview.tsx →
 * parameters.docs.theme) so the whole tool reads as Shiranami.
 */

// Brand accent — the app's canonical violet primary. The app ships it as the
// sRGB triplet rgb(155,125,235) (--primary-rgb, ≈ oklch(0.72 0.12 280)); the
// hover is a slightly deeper violet (≈ --brand-600 oklch(0.65 0.15 285)).
const violet = '#9b7deb';
const violetDeep = '#7e5bd6';

// Midnight-violet surfaces / ink (oklch hue 280). The app's :root is very dark
// (oklch L 0.06–0.12); these sRGB equivalents are lifted a touch so the
// Storybook chrome reads as deep violet rather than pure black.
const bg = '#0b0912'; // window background ≈ oklch(0.08 0.02 280)
const surface = '#14121d'; // cards & chrome bars ≈ oklch(0.12 0.02 280)
const ink = '#e6e7ef'; // primary text ≈ oklch(0.93 0.01 280)
const inkMuted = '#9c9dab'; // secondary text ≈ oklch(0.70 0.02 280)
const line = '#262130'; // borders — white/~12% over bg

export const shiranamiTheme = create({
  base: 'dark',

  brandTitle: 'Shiranami',
  // The mascot, served at the Storybook root from apps/web/public — by Vite's
  // publicDir middleware in `storybook dev` and copied into the bundle by
  // `storybook build`, so it resolves in both dev and the deployed static build.
  brandImage: '/mascot.png',
  brandTarget: '_self',

  colorPrimary: violet,
  colorSecondary: violet,

  appBg: surface,
  appContentBg: bg,
  appPreviewBg: bg,
  appBorderColor: line,
  appBorderRadius: 12,

  textColor: ink,
  textInverseColor: bg,
  textMutedColor: inkMuted,

  barBg: surface,
  barTextColor: inkMuted,
  barSelectedColor: violet,
  barHoverColor: violetDeep,

  inputBg: bg,
  inputBorder: line,
  inputTextColor: ink,
  inputBorderRadius: 8,

  fontBase: "'DM Sans', system-ui, sans-serif",
  fontCode: "'JetBrains Mono', ui-monospace, monospace",
});
