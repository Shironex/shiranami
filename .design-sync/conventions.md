# Shiranami (白波) — design conventions

Shiranami is a **calm, dark-only desktop music player** with a "Midnight Lofi Cafe"
look: dark-lavender surfaces, soft purple glow, low-contrast text, barely-there
hairlines, rounded `12px` cards, and quiet motion. Build on-brand by leaning on the
design tokens and the existing components — never hand-roll a light theme or new
chrome.

## Setup & theming

Everything is **dark-only**. The theme is delivered as CSS custom properties on
`:root` (already loaded via `styles.css`) and surfaced as Tailwind utilities. There is
no light mode and no theme toggle to wire up — just compose components on the dark
surface. A screen's outermost element should establish the app surface:

```jsx
<div className="bg-background text-foreground min-h-screen font-sans">
  {/* components go here */}
</div>
```

Components render correctly as soon as the token stylesheet is present. (Inside the
real app some components also consume i18n / query / tooltip context, but for layout
and composition you can place them directly.)

## Styling idiom — Tailwind 4 utilities mapped to brand tokens

Style with **Tailwind utility classes** that resolve to the brand tokens. Do not invent
hex colors — use these families so everything stays on the lavender-dark palette:

| Family    | Utilities                                                                      | Token                           |
| --------- | ------------------------------------------------------------------------------ | ------------------------------- |
| Surfaces  | `bg-background` `bg-card` `bg-popover` `bg-muted`                              | base dark lavender ramp         |
| Text      | `text-foreground` (primary) `text-muted-foreground` (secondary/captions)       | low-contrast ink                |
| Brand     | `bg-primary` `text-primary` `border-primary`                                   | lavender `oklch(0.72 0.12 280)` |
| Accents   | `text-favorite` (heart) `text-destructive` (errors)                            | semantic only                   |
| Hairlines | `border-border` (≈white/6%, near-invisible) `border-border-strong`             | paper-on-paper dividers         |
| Radius    | `rounded-xl` (12px, default) `rounded-lg` (8px, thumbs) `rounded-full` (pills) | —                               |
| Type      | `font-sans` (DM Sans, body 14px) `font-display` (Sora 600, headings)           | —                               |

Conventions to match: borders are **barely visible** (default `border-border`); lavender
is the **only** chroma color in app chrome (gold/teal are landing-only); active/toggle
states use a lavender glass pill (`bg-primary/15 text-primary`); hover steps the
background up one alpha and text from `muted-foreground` to `foreground`. Mono
UPPERCASE micro-labels with wide tracking (`0.18em`) are used for status/eyebrow text.
No emoji — use Lucide icons (the components already do).

## Where the truth lives

- **`styles.css`** and its `@import` closure (incl. `_ds_bundle.css`) — the compiled
  tokens + component styles. Read it to see every available `--token` and utility.
- **`components/<group>/<Name>/<Name>.prompt.md`** — per-component usage + examples
  drawn from the real Storybook stories. Read these before composing a component.
- Components are grouped by feature: `player/`, `library/`, `playlists/`, `settings/`,
  `overview/`, `history/`, `now-playing/`, `search/`, `shared/`, `splash/`, and more.

## Build snippet

A small on-brand card built with the library + the styling idiom:

```jsx
const { StatTile, TrackRow, PlayerControls } = window.ShiranamiWeb;

<div className="bg-background text-foreground min-h-screen p-6 font-sans">
  <div className="grid grid-cols-3 gap-4">
    <StatTile label="Listened this week" value="14h 32m" />
    {/* ...more tiles */}
  </div>
  <div className="mt-6 rounded-xl border border-border bg-card p-4">
    <h2 className="font-display text-xl text-foreground">Recently played</h2>
    {/* compose TrackRow rows here */}
  </div>
</div>;
```

> Note: components are compiled from a desktop **app**, so prop contracts in the
> `.d.ts` files are permissive (`any`). The `.prompt.md` usage examples (from real
> stories) are the authoritative guide to each component's props.
