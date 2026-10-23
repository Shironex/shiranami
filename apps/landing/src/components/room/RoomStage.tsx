import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// three.js and R3F live behind this dynamic import, in their own chunk.
const RoomCanvas = lazy(() => import('./RoomCanvas'));

/** Past this the room gives up on 3D and shows the poster instead of a stuck loader. */
const DEADLINE = 25_000;

interface Props {
  /** Props that have a real GLB in public/room/models (file name without .glb). */
  models: string[];
}

/**
 * The island. Mounts the 3D room unless the page decided on static mode
 * (phone width, reduced motion or no WebGL 2), drives the loader, and marks
 * the stage ready once the room is complete so the canvas fades in.
 */
export default function RoomStage({ models }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    const room = anchor.current?.closest('[data-room]');
    setRun(!!room && !room.hasAttribute('data-static'));
  }, []);

  // A failed chunk, a scene error or a request that never settles: go static,
  // which brings back the poster the page skipped for the loader.
  const fail = useCallback(() => {
    const room = anchor.current?.closest('[data-room]');
    if (!room || room.querySelector('[data-room-stage][data-ready]')) return;
    room.setAttribute('data-static', '');
    room.querySelector('[data-room-blank]')?.remove();
    setRun(false);
  }, []);

  useEffect(() => {
    if (!run) return;
    const timer = window.setTimeout(fail, DEADLINE);
    return () => window.clearTimeout(timer);
  }, [run, fail]);

  const onProgress = useCallback((percent: number) => {
    const stage = anchor.current?.closest('[data-room-stage]');
    const pct = stage?.querySelector('[data-room-loader-pct]');
    const bar = stage?.querySelector<HTMLElement>('[data-room-loader-bar]');
    const value = Math.round(percent);
    if (pct) pct.textContent = `${value}%`;
    if (bar) bar.style.width = `${value}%`;
  }, []);

  const onReady = () => {
    const stage = anchor.current?.closest<HTMLElement>('[data-room-stage]');
    if (stage) stage.dataset.ready = '';
  };

  return (
    <>
      {/* Fills the stage and anchors the closest() lookups above. The island
          hydrates on desktop widths only, so phones never fetch React. */}
      <div ref={anchor} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {run && (
        <Guard onError={fail}>
          <Suspense fallback={null}>
            <RoomCanvas models={models} onProgress={onProgress} onReady={onReady} />
          </Suspense>
        </Guard>
      )}
    </>
  );
}

class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[room] 3D failed, showing the poster', error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
