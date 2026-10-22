import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { AgXToneMapping, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { ModelsContext } from './Prop';
import { RoomScene } from './Scene';
import { room } from './progress';
import { ROOM_STOPS } from './stops';

interface Props {
  models: string[];
  onReady: () => void;
}

export default function RoomCanvas({ models, onReady }: Props) {
  const [visible, setVisible] = useState(true);

  // Stop rendering once the room has scrolled out of view.
  useEffect(() => {
    const el = document.querySelector('[data-room]');
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const first = ROOM_STOPS[0].camera;

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      dpr={[1, 1.5]}
      frameloop={visible ? 'always' : 'never'}
      camera={{ position: [...first.position], fov: first.fov, near: 0.05, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = AgXToneMapping;
        gl.toneMappingExposure = 1.15;
      }}
    >
      <ModelsContext.Provider value={new Set(models)}>
        <CameraRig />
        <RoomScene />
        <ReadySignal onReady={onReady} />
      </ModelsContext.Provider>
    </Canvas>
  );
}

const pos = new Vector3();
const target = new Vector3();
const look = new Vector3();
const a = new Vector3();
const b = new Vector3();

/** Reads the scroll position each frame and eases the camera toward it. */
function CameraRig() {
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const sections = useRef<HTMLElement[]>([]);
  const started = useRef(false);

  useEffect(() => {
    sections.current = [...document.querySelectorAll<HTMLElement>('[data-room-stop]')];
  }, []);

  useFrame((state, delta) => {
    room.p = scrollProgress(sections.current);
    room.t = state.clock.elapsedTime;

    // Hold on each stop for the middle half of its section, blend between.
    const i = Math.min(Math.floor(room.p), ROOM_STOPS.length - 2);
    const f = MathUtils.smoothstep(room.p - i, 0.25, 0.75);
    const from = ROOM_STOPS[i].camera;
    const to = ROOM_STOPS[i + 1].camera;

    pos.lerpVectors(a.fromArray(from.position), b.fromArray(to.position), f);
    target.lerpVectors(a.fromArray(from.target), b.fromArray(to.target), f);
    const fov = MathUtils.lerp(from.fov, to.fov, f);

    // A slow 2 degree drift so the room never looks frozen.
    const drift = Math.sin(room.t * 0.25) * 0.035;
    target.x += drift * pos.distanceTo(target);

    const k = started.current ? 1 - Math.exp(-delta * 5) : 1;
    started.current = true;
    camera.position.lerp(pos, k);
    look.lerp(target, k);
    camera.lookAt(look);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = MathUtils.lerp(camera.fov, fov, k);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** 0 at the first stop, 1 at the second, and so on, from the sections' layout. */
function scrollProgress(sections: HTMLElement[]): number {
  if (sections.length < 2) return 0;
  const tops = sections.map(s => s.getBoundingClientRect().top);
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i] <= 0) {
      const next = tops[i + 1] ?? tops[i] + sections[i].offsetHeight;
      return Math.min(i + -tops[i] / (next - tops[i]), tops.length - 1);
    }
  }
  return 0;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    if (++frames.current === 3) onReady();
  });
  return null;
}
