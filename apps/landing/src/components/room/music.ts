// The room's music: one loop, fetched and decoded on the first play, looped
// as a buffer so it is gapless, faded in and out. The page's music button
// drives it and the room reads its clock to nod on the beat. No three.js
// imports: the page script and the island share this module.

const SRC = { ogg: '/room/audio/room-music.ogg', m4a: '/room/audio/room-music.m4a' };
/**
 * The track's beat length in seconds: the one value to change with the track.
 * The head nod (one per beat) and the lyric lines follow it. The file loops
 * whole, from a beat: 4/4 at 82.5 bpm, a 52.36 s loop.
 */
export const BEAT = 0.727;
const FADE = 1.5;
/** Gain while the room is scrolled out of view. */
const AWAY = 0.6;

let ctx: AudioContext | null = null;
let fade: GainNode | null = null;
let duck: GainNode | null = null;
let buffer: Promise<AudioBuffer> | null = null;
let source: AudioBufferSourceNode | null = null;
/** The loop still fading out after stop(); start() cuts it so two never overlap. */
let fading: AudioBufferSourceNode | null = null;
let startedAt = 0;
let away = false;
/** What the viewer last asked for; a stop while the file loads wins. */
let wanted = false;

function format(): string {
  const probe = document.createElement('audio');
  // Opus decodes without the AAC priming gap, so the loop seam stays clean.
  return probe.canPlayType('audio/ogg; codecs=opus') ? SRC.ogg : SRC.m4a;
}

function setup(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  fade = ctx.createGain();
  duck = ctx.createGain();
  fade.gain.value = 0;
  duck.gain.value = away ? AWAY : 1;
  fade.connect(duck).connect(ctx.destination);
  return ctx;
}

function load(audio: AudioContext): Promise<AudioBuffer> {
  buffer ??= fetch(format())
    .then(response => {
      if (!response.ok) throw new Error(`music: ${response.status}`);
      return response.arrayBuffer();
    })
    .then(data => audio.decodeAudioData(data))
    .catch(error => {
      buffer = null; // let the next click try again
      throw error;
    });
  return buffer;
}

export const music = {
  /** True from start() until stop(). */
  get playing() {
    return source !== null;
  },

  /** Beats since the start of the current pass through the loop, or null while silent. */
  beats(): number | null {
    if (!ctx || !source?.buffer) return null;
    return (Math.max(0, ctx.currentTime - startedAt) % source.buffer.duration) / BEAT;
  },

  /** Starts the loop. Call from a user gesture (it creates the AudioContext). */
  async start(): Promise<void> {
    wanted = true;
    const audio = setup();
    if (audio.state === 'suspended') await audio.resume();
    const data = await load(audio);
    if (source || !fade || !wanted) return;
    fading?.stop();
    fading = null;
    source = audio.createBufferSource();
    source.buffer = data;
    source.loop = true;
    source.connect(fade);
    const now = audio.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE);
    source.start(now);
    startedAt = now;
  },

  /** Fades the loop out and stops it. */
  stop() {
    wanted = false;
    if (!ctx || !fade || !source) return;
    const now = ctx.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + FADE);
    source.stop(now + FADE);
    fading = source;
    source = null;
  },

  /** Lowers the volume while the room is out of view. */
  setAway(value: boolean) {
    away = value;
    if (ctx && duck) duck.gain.setTargetAtTime(value ? AWAY : 1, ctx.currentTime, 0.4);
  },

  /** For tests: the context state and clock. */
  debug() {
    return {
      state: ctx?.state ?? 'none',
      time: ctx?.currentTime ?? 0,
      playing: source !== null,
      duration: source?.buffer?.duration ?? 0,
      loop: source?.loop ?? false,
      gain: fade?.gain.value ?? 0,
      away: duck?.gain.value ?? 1,
    };
  },
};
