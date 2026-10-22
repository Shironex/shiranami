import { Html } from '@react-three/drei';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useRef } from 'react';
import { motion } from './motion';
import { BEAT, music } from './music';
import { near } from './progress';

// HTML that lives in the room: the lyrics on the window glass, the radio's
// station readout and the decks' level bars. Real text, positioned by drei's
// Html each frame; the whole stage is aria-hidden, so it is decoration only.

type GroupProps = ThreeElements['group'];

/** Writes opacity and visibility together, so hidden overlays cost no paint. */
function fadeTo(el: HTMLElement | null, opacity: number) {
  if (!el) return;
  el.style.opacity = opacity.toFixed(3);
  el.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
}

// ------------------------------------------------------------------- lyrics

// [PLACEHOLDER LYRICS] Stand-in lines until the real lyrics are chosen.
const LYRICS = [
  'the tide keeps time for us tonight',
  'lamplight on an old record sleeve',
  'slow waves under a paper moon',
  'stay until the needle lifts',
  'white noise, white waves, a quiet room',
];
/** One line every 8 beats (two bars), so it follows the music when it plays. */
const LINE_BEATS = 8;

/** Lyric lines condensing on the glass: the active one bright, the rest dim. */
export function GlassLyrics(group: GroupProps) {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef(-1);

  useFrame(state => {
    const el = root.current;
    fadeTo(el, near(3, 0.6));
    if (!el || el.style.visibility === 'hidden') return;
    const beats = music.beats() ?? state.clock.elapsedTime / BEAT;
    const i = Math.floor(beats / LINE_BEATS) % LYRICS.length;
    if (i === shown.current) return;
    shown.current = i;
    el.style.setProperty('--line', String(i));
    el.querySelectorAll('li').forEach((li, k) => li.toggleAttribute('data-active', k === i));
  });

  return (
    <group {...group}>
      <Html center zIndexRange={[2, 1]} style={{ pointerEvents: 'none' }}>
        <div
          ref={root}
          className="room-lyrics"
          data-placeholder-lyrics
          data-still={motion.reduced ? '' : undefined}
          style={{ opacity: 0, visibility: 'hidden' }}
        >
          <ol>
            {LYRICS.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      </Html>
    </group>
  );
}

// -------------------------------------------------------------------- radio

/** Four example stations along the dial (MHz). No real station names. */
export const STATIONS = [
  { mhz: 94.0, name: 'Night Ferry' },
  { mhz: 96.2, name: 'Harbour Soul' },
  { mhz: 98.4, name: 'Lantern Talk' },
  // The needle comes to rest here at the radio stop.
  { mhz: 100.8, name: 'Low Tide FM' },
];

/** The station under the needle, or null between stations. */
export function stationAt(mhz: number) {
  return STATIONS.find(s => Math.abs(s.mhz - mhz) < 0.45) ?? null;
}

/**
 * A small readout that rides above the dial needle at the radio stop. `read`
 * returns the dial frequency each frame; the parent moves this group to the
 * needle tip.
 */
export function StationReadout({ read, ...group }: GroupProps & { read: () => number }) {
  const root = useRef<HTMLDivElement>(null);
  const freq = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const last = useRef('');

  useFrame(() => {
    fadeTo(root.current, near(2, 0.5));
    if (root.current?.style.visibility === 'hidden') return;
    const mhz = read();
    const station = stationAt(mhz);
    const text = `${mhz.toFixed(1)}|${station?.name ?? ''}`;
    if (text === last.current) return;
    last.current = text;
    if (freq.current) freq.current.textContent = `${mhz.toFixed(1)} MHz`;
    if (name.current) name.current.textContent = station?.name ?? 'tuning…';
    root.current?.toggleAttribute('data-tuned', !!station);
  });

  return (
    <group {...group}>
      <Html center zIndexRange={[2, 1]} style={{ pointerEvents: 'none' }}>
        <div ref={root} className="room-station" style={{ opacity: 0, visibility: 'hidden' }}>
          <span ref={freq} className="room-station-freq" />
          <span ref={name} className="room-station-name" />
        </div>
      </Html>
    </group>
  );
}

// ------------------------------------------------------------------- decks

const SEGMENTS = 10;

/**
 * A deck's level bar at the crossfade stop. `level` returns 0 to 1 each frame
 * (the decks trade places as the tonearms move).
 */
export function DeckLevel({
  deck,
  level,
  ...group
}: GroupProps & { deck: 'A' | 'B'; level: () => number }) {
  const root = useRef<HTMLDivElement>(null);
  const lit = useRef(-1);

  useFrame(state => {
    fadeTo(root.current, near(4, 0.6));
    const el = root.current;
    if (!el || el.style.visibility === 'hidden') return;
    // A little life in the meter while the deck plays.
    const v = level();
    const wobble = motion.reduced
      ? 0
      : 0.06 * Math.sin(state.clock.elapsedTime * 9 + (deck === 'A' ? 0 : 2));
    const n = Math.round(Math.max(0, Math.min(1, v * (0.94 + wobble))) * SEGMENTS);
    if (n === lit.current) return;
    lit.current = n;
    el.querySelectorAll('i').forEach((seg, k) => seg.toggleAttribute('data-on', k < n));
  });

  return (
    <group {...group}>
      <Html center zIndexRange={[2, 1]} style={{ pointerEvents: 'none' }}>
        <div ref={root} className="room-level" style={{ opacity: 0, visibility: 'hidden' }}>
          <span className="room-level-bar">
            {Array.from({ length: SEGMENTS }, (_, k) => (
              <i key={k} />
            ))}
          </span>
          <span className="room-level-deck">{deck}</span>
        </div>
      </Html>
    </group>
  );
}
