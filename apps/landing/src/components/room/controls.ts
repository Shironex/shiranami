// The room page's own controls: the stop dots and the music button. Plain DOM,
// no three.js, so it runs in static mode too.
import { motion } from './motion';
import { music } from './music';
import { scrollProgress, stopSections } from './scroll';

const STORE = 'shiranami.room.music';

function remembered(): boolean {
  try {
    return localStorage.getItem(STORE) === 'on';
  } catch {
    return false;
  }
}

function remember(on: boolean) {
  try {
    localStorage.setItem(STORE, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice just is not kept.
  }
}

/** Sets up the dots and the music button. Safe to call on every page load. */
export function initRoomControls() {
  const room = document.querySelector<HTMLElement>('[data-room]');
  const button = document.querySelector<HTMLButtonElement>('[data-room-music]');
  if (!room || !button || room.dataset.controls) return;
  room.dataset.controls = '';
  // Dev only: lets the browser checks read the audio clock.
  if (import.meta.env.DEV) Object.assign(window, { __roomMusic: music });

  // ------------------------------------------------------------ stop dots
  const sections = stopSections();
  const dots = [...document.querySelectorAll<HTMLAnchorElement>('[data-room-dot]')];
  let queued = false;
  const update = () => {
    queued = false;
    const p = scrollProgress(sections);
    const active = Math.min(Math.round(p), dots.length - 1);
    dots.forEach((dot, i) => {
      if (i === active) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
    // Past the room: the dots go and the music steps back.
    const away = room.getBoundingClientRect().bottom < innerHeight * 0.75;
    room.toggleAttribute('data-away', away);
    music.setAway(away);
  };
  const onScroll = () => {
    if (!queued) requestAnimationFrame(update);
    queued = true;
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  update();

  dots.forEach((dot, i) => {
    dot.addEventListener('click', event => {
      event.preventDefault();
      sections[i]?.scrollIntoView({ behavior: motion.reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  // ---------------------------------------------------------------- music
  const show = (state: 'off' | 'ready' | 'loading' | 'on') => {
    button.dataset.state = state;
    button.setAttribute('aria-pressed', String(state !== 'off'));
  };

  const play = () => {
    show('loading');
    music.start().then(
      () => show(music.playing ? 'on' : 'off'),
      error => {
        console.warn('[room] music failed', error);
        show('off');
        remember(false);
      }
    );
  };

  // Never autoplay: a remembered "on" waits, shown as ready, for the next gesture.
  let waiting = remembered();
  show(waiting ? 'ready' : 'off');
  const onGesture = (event: Event) => {
    if (!waiting || button.contains(event.target as Node)) return;
    waiting = false;
    play();
  };
  if (waiting) {
    document.addEventListener('pointerdown', onGesture, { capture: true });
    document.addEventListener('keydown', onGesture, { capture: true });
  }

  button.addEventListener('click', () => {
    const state = button.dataset.state;
    if (state === 'on' || state === 'loading') {
      music.stop();
      show('off');
      remember(false);
    } else {
      waiting = false;
      remember(true);
      play();
    }
  });
}
