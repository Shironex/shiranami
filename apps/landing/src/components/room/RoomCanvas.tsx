import { useProgress } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AgXToneMapping,
  MathUtils,
  PerspectiveCamera,
  Vector3,
  type Mesh,
  type Object3D,
} from 'three';
import { Effects } from './Effects';
import { motion } from './motion';
import { ModelsContext, settledModels } from './Prop';
import { RoomScene } from './Scene';
import { room } from './progress';
import { scrollProgress, stopSections } from './scroll';
import { ROOM_STOPS } from './stops';

interface Props {
  models: string[];
  /** Load progress, 0 to 100. */
  onProgress: (percent: number) => void;
  /** Every model and texture is in and a frame has rendered with them. */
  onReady: () => void;
}

export default function RoomCanvas({ models, onProgress, onReady }: Props) {
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
        gl.toneMappingExposure = 1.3;
      }}
    >
      <ModelsContext.Provider value={new Set(models)}>
        <CameraRig />
        <RoomScene />
        <Effects />
        <LoadGate models={models} onProgress={onProgress} onReady={onReady} />
      </ModelsContext.Provider>
    </Canvas>
  );
}

const pos = new Vector3();
const target = new Vector3();
const look = new Vector3();
const a = new Vector3();
const b = new Vector3();
const side = new Vector3();
const up = new Vector3();

/** The pointer, -1 to 1 across the window, and its smoothed follower. */
const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
/** How far the pointer swings the camera around its target, in radians. */
const PARALLAX = { yaw: 0.045, pitch: 0.03 };

/** Reads the scroll position each frame and eases the camera toward it. */
function CameraRig() {
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const sections = useRef<HTMLElement[]>([]);
  const started = useRef(false);

  useEffect(() => {
    sections.current = stopSections();
    // Desktop only: the stops sit over the canvas, so listen on the window.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = (e.clientY / innerHeight) * 2 - 1;
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => removeEventListener('pointermove', onMove);
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
    const fov = lockedFov(MathUtils.lerp(from.fov, to.fov, f), camera.aspect);

    // A slow 2 degree drift so the room never looks frozen.
    const drift = Math.sin(room.t * 0.25) * 0.035;
    target.x += drift * pos.distanceTo(target);

    // Mouse parallax: a few degrees around the target, eased, never on touch
    // or under reduced motion.
    const on = motion.finePointer && !motion.reduced;
    const p = 1 - Math.exp(-delta * 2.5);
    pointer.sx += ((on ? pointer.x : 0) - pointer.sx) * p;
    pointer.sy += ((on ? pointer.y : 0) - pointer.sy) * p;
    const dist = pos.distanceTo(target);
    side.subVectors(target, pos).cross(camera.up).normalize();
    up.crossVectors(side, a.subVectors(target, pos)).normalize();
    pos.addScaledVector(side, pointer.sx * PARALLAX.yaw * dist);
    pos.addScaledVector(up, -pointer.sy * PARALLAX.pitch * dist);

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

/** The aspect the stops are framed at (1440 x 900). */
const FRAME_ASPECT = 1.6;

/**
 * The stops' fov is vertical. On a wider screen, keep the horizontal view of
 * the framing aspect and crop top and bottom instead, so nothing new walks in
 * at the side edges (the copy on the left, the mascot on the right).
 */
function lockedFov(fov: number, aspect: number): number {
  if (aspect <= FRAME_ASPECT) return fov;
  const half = Math.tan(MathUtils.degToRad(fov / 2)) * (FRAME_ASPECT / aspect);
  return MathUtils.radToDeg(2 * Math.atan(half));
}

/**
 * Reports load progress and fires once the room is complete: every model has
 * settled (loaded, or failed and kept its blockout), the loading manager is
 * idle, every material has drawn once, and two frames have rendered since. Until then the canvas stays
 * hidden, so the blockouts never flash in before the models.
 */
function LoadGate({ models, onProgress, onReady }: Props) {
  const { active, progress } = useProgress();
  const shown = useRef(0);
  const frames = useRef(-1);

  useEffect(() => {
    // The manager's total grows as GLBs discover their textures: never step back.
    shown.current = Math.max(shown.current, Math.min(progress, 99));
    onProgress(shown.current);
  }, [progress, onProgress]);

  // The GPU builds each shader on its first draw, about 45 ms apiece: drawn all
  // on one frame that blocks the main thread for most of a second. So the room
  // stays hidden while it loads, then shows one material per frame.
  const scene = useThree(state => state.scene);
  const warming = useRef<Object3D[][]>([]);
  useLayoutEffect(() => {
    scene.visible = false;
    return () => {
      scene.visible = true;
    };
  }, [scene]);

  useFrame(() => {
    if (frames.current === -2) {
      const next = warming.current.shift();
      if (next) for (const mesh of next) mesh.visible = true;
      else frames.current = 0;
      return;
    }
    if (frames.current < 0) {
      const settled = models.every(name => settledModels.has(name));
      if (!settled || active) return;
      const byMaterial = new Map<unknown, Object3D[]>();
      scene.traverse(child => {
        const mesh = child as Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        const key = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        byMaterial.set(key, [...(byMaterial.get(key) ?? []), mesh]);
        mesh.visible = false;
      });
      warming.current = [...byMaterial.values()];
      scene.visible = true;
      frames.current = -2;
      return;
    }
    if (++frames.current === 2) {
      onProgress(100);
      onReady();
    }
  });
  return null;
}
