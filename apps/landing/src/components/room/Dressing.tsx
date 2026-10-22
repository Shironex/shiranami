import { useTexture } from '@react-three/drei';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  type InstancedMesh,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  type PointLight,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { motion } from './motion';
import { Prop } from './Prop';
import { mat } from './props';
import { room } from './progress';

// The room's dressing: the poster, the string lights, the plant, books and
// mug (GLBs with blockouts), and the soft blob shadows under moving parts.

type GroupProps = ThreeElements['group'];

// -------------------------------------------------------------------- poster

const POSTER = { width: 0.34, height: 0.51, frame: 0.016 };

/** The night-sea print in a thin dark frame, hung flat on the wall. */
export function Poster(group: GroupProps) {
  const map = useTexture('/room/textures/poster.webp', t => {
    t.colorSpace = SRGBColorSpace;
  });
  // Lit by the room like a real print, so it stays quieter than the headline.
  const print = useMemo(() => new MeshStandardMaterial({ map, roughness: 0.9 }), [map]);
  const { width, height, frame } = POSTER;
  return (
    <group {...group}>
      <mesh position={[0, 0, 0.008]} material={mat.woodDark}>
        <boxGeometry args={[width + frame * 2, height + frame * 2, 0.016]} />
      </mesh>
      <mesh position={[0, 0, 0.0165]} material={print}>
        <planeGeometry args={[width, height]} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------- string lights

const BULBS = 22;
const WARM = new Color('#ffb46b');
/** Bulb brightness past white, so they bloom. */
const BULB_GLOW = 3.2;

/**
 * Warm fairy lights draped in two swoops along the top of the window frame.
 * Each bulb flickers gently on its own phase; under reduced motion they hold still.
 */
export function StringLights({
  from,
  to,
  sag = 0.07,
}: {
  from: Vector3;
  to: Vector3;
  sag?: number;
}) {
  const bulbs = useRef<InstancedMesh>(null);
  const light = useRef<PointLight>(null);

  const { wire, points } = useMemo(() => {
    // Two swoops: ends and middle pinned, sagging between.
    const mid = from.clone().lerp(to, 0.5);
    const dip = (a: Vector3, b: Vector3) =>
      a
        .clone()
        .lerp(b, 0.5)
        .add(new Vector3(0, -sag, 0.03));
    const curve = new CatmullRomCurve3([from, dip(from, mid), mid, dip(mid, to), to]);
    return {
      wire: new BufferGeometry().setFromPoints(curve.getPoints(64)),
      points: Array.from({ length: BULBS }, (_, i) => curve.getPointAt((i + 0.5) / BULBS)),
    };
  }, [from, to, sag]);
  const line = useMemo(() => new Line(wire, new LineBasicMaterial({ color: '#1a1420' })), [wire]);
  const bulbMaterial = useMemo(() => new MeshBasicMaterial({ color: '#ffffff' }), []);

  useLayoutEffect(() => {
    const mesh = bulbs.current;
    if (!mesh) return;
    const o = new Object3D();
    points.forEach((p, i) => {
      o.position.copy(p).add(new Vector3(0, -0.012, 0));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [points]);

  const c = useMemo(() => new Color(), []);
  useFrame(() => {
    const mesh = bulbs.current;
    if (!mesh) return;
    const still = motion.reduced;
    let sum = 0;
    for (let i = 0; i < BULBS; i++) {
      const t = room.t;
      const flicker = still
        ? 1
        : 0.82 + 0.12 * Math.sin(t * 1.7 + i * 2.3) + 0.06 * Math.sin(t * 5.3 + i * 7.1);
      sum += flicker;
      mesh.setColorAt(i, c.copy(WARM).multiplyScalar(BULB_GLOW * flicker));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (light.current) light.current.intensity = 0.5 * (sum / BULBS);
  });

  const centre = from.clone().lerp(to, 0.5);
  return (
    <group>
      <primitive object={line} />
      <instancedMesh ref={bulbs} args={[undefined, bulbMaterial, BULBS]}>
        <sphereGeometry args={[0.011, 10, 8]} />
      </instancedMesh>
      {/* A faint warm spill on the wall and the frame around the window top. */}
      <pointLight
        ref={light}
        position={[centre.x, centre.y - 0.05, centre.z + 0.15]}
        color="#ffb46b"
        intensity={0.5}
        distance={1.6}
        decay={2}
      />
    </group>
  );
}

// ------------------------------------------------------- plant, books, mug

const m = (color: string) => new MeshStandardMaterial({ color, roughness: 0.85 });

export function Plant(group: GroupProps) {
  return (
    <Prop {...group} name="plant">
      <mesh position={[0, 0.06, 0]} material={mat.lavender}>
        <cylinderGeometry args={[0.07, 0.055, 0.12, 20]} />
      </mesh>
      <mesh position={[0, 0.19, 0]} material={m('#2f5a55')}>
        <sphereGeometry args={[0.11, 16, 12]} />
      </mesh>
    </Prop>
  );
}

export function Books(group: GroupProps) {
  const colors = ['#3a2d57', '#efe2c2', '#3f8f8c'];
  return (
    <Prop {...group} name="books">
      {colors.map((color, i) => (
        <mesh
          key={color}
          position={[0, 0.015 + i * 0.03, 0]}
          rotation={[0, i * 0.08, 0]}
          material={m(color)}
        >
          <boxGeometry args={[0.22, 0.03, 0.16]} />
        </mesh>
      ))}
    </Prop>
  );
}

export function Mug(group: GroupProps) {
  return (
    <Prop {...group} name="mug">
      <mesh position={[0, 0.05, 0]} material={mat.lavender}>
        <cylinderGeometry args={[0.045, 0.042, 0.1, 20]} />
      </mesh>
      <mesh position={[0.05, 0.05, 0]} material={mat.lavender}>
        <torusGeometry args={[0.025, 0.007, 8, 16]} />
      </mesh>
    </Prop>
  );
}

// ---------------------------------------------------------------- blob shadow

const blob = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  uniforms: { uOpacity: { value: 0.4 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity * pow(1.0 - smoothstep(0.0, 1.0, r), 1.6));
    }
  `,
});

/**
 * A soft dark ellipse on the surface under a moving part: the mascot and the
 * second deck are not in the bake, so they get this instead. Lies flat.
 */
export function BlobShadow({
  size,
  opacity = 0.4,
  ...group
}: GroupProps & { size: [number, number]; opacity?: number }) {
  const material = useMemo(() => {
    const own = blob.clone();
    own.uniforms.uOpacity.value = opacity;
    return own;
  }, [opacity]);
  return (
    <group {...group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
        <planeGeometry args={size} />
      </mesh>
    </group>
  );
}
