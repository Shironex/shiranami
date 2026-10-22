import { lazy, Suspense, useEffect, useRef, useState } from 'react';

// three.js and R3F live behind this dynamic import, in their own chunk.
const RoomCanvas = lazy(() => import('./RoomCanvas'));

interface Props {
  /** Props that have a real GLB in public/room/models (file name without .glb). */
  models: string[];
}

/**
 * The island. Mounts the 3D room unless the page decided on static mode
 * (phone width, reduced motion or no WebGL 2), and hides the poster once the
 * first frame has rendered.
 */
export default function RoomStage({ models }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    const room = anchor.current?.closest('[data-room]');
    setRun(!!room && !room.hasAttribute('data-static'));
  }, []);

  const onReady = () => {
    const stage = anchor.current?.closest<HTMLElement>('[data-room-stage]');
    if (stage) stage.dataset.ready = '';
  };

  return (
    <>
      {/* Fills the stage: client:visible needs a box to observe, and this is it. */}
      <div ref={anchor} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {run && (
        <Suspense fallback={null}>
          <RoomCanvas models={models} onReady={onReady} />
        </Suspense>
      )}
    </>
  );
}
