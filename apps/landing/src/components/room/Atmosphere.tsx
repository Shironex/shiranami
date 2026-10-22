import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  type Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { motion } from './motion';
import { room } from './progress';

// Fake volumetrics: a soft moonbeam from the window onto the floor, and dust
// motes drifting in it and in the lamp light. Both are additive and cheap.

type V3 = readonly [number, number, number];

/**
 * The beam is one quad from a strip of the window to the moon patch on the
 * floor, brightest at the glass and along its middle, fading out at the floor
 * and at its sides.
 */
export function Moonbeam({ top, bottom }: { top: readonly [V3, V3]; bottom: readonly [V3, V3] }) {
  const { geometry, material } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([...top[0], ...top[1], ...bottom[1], ...bottom[0]]), 3)
    );
    g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 3, 1, 1, 3, 2]);
    g.computeVertexNormals();
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0.05 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          float across = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          // Clamped: pow of a negative is NaN, and one NaN pixel blacks out the whole bloom.
          float v = clamp(vUv.y, 0.0, 1.0);
          float along = pow(1.0 - v, 1.4) * smoothstep(0.0, 0.08, v) + 0.15 * (1.0 - v);
          // A slow shimmer of streaks, as if the air moved.
          float streak = 0.85 + 0.15 * sin(vUv.x * 23.0 + uTime * 0.3) * sin(vUv.x * 7.0 - uTime * 0.17);
          gl_FragColor = vec4(vec3(0.55, 0.6, 1.0) * across * along * streak * uStrength, 1.0);
        }
      `,
    });
    return { geometry: g, material: m };
  }, [top, bottom]);

  useFrame(() => {
    if (!motion.reduced) material.uniforms.uTime.value = room.t;
  });

  return <mesh geometry={geometry} material={material} renderOrder={2} />;
}

const MOTES = 56;

/**
 * Dust in two boxes of air (min and max corners): one around the lamp, warm,
 * and one in the moonbeam, cool. Each mote drifts on its own slow loop and
 * glints in and out. Hidden under reduced motion.
 */
export function Dust({ lamp, beam }: { lamp: readonly [V3, V3]; beam: readonly [V3, V3] }) {
  const points = useRef<Points>(null);
  const { geometry, material } = useMemo(() => {
    const rand = mulberry(7);
    const pos = new Float32Array(MOTES * 3);
    const seed = new Float32Array(MOTES);
    const warm = new Float32Array(MOTES);
    const v = new Vector3();
    for (let i = 0; i < MOTES; i++) {
      const inLamp = i < MOTES * 0.55;
      const [lo, hi] = inLamp ? lamp : beam;
      v.set(lerp(lo[0], hi[0], rand()), lerp(lo[1], hi[1], rand()), lerp(lo[2], hi[2], rand()));
      v.toArray(pos, i * 3);
      seed[i] = rand() * 100;
      warm[i] = inLamp ? 1 : 0;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new BufferAttribute(seed, 1));
    g.setAttribute('aWarm', new BufferAttribute(warm, 1));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uScale;
        attribute float aSeed;
        attribute float aWarm;
        varying float vGlint;
        varying float vWarm;
        void main() {
          float t = uTime * 0.12 + aSeed;
          vec3 p = position + vec3(sin(t * 1.3) * 0.06, sin(t * 0.7 + 1.7) * 0.05, cos(t * 0.9) * 0.05);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vGlint = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 0.8 + aSeed * 3.1), 3.0);
          vWarm = aWarm;
          gl_PointSize = uScale * 0.006 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vGlint;
        varying float vWarm;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 col = mix(vec3(0.6, 0.66, 1.0), vec3(1.0, 0.78, 0.5), vWarm);
          gl_FragColor = vec4(col * a * vGlint * 0.55, 1.0);
        }
      `,
    });
    return { geometry: g, material: m };
  }, [lamp, beam]);

  useFrame(state => {
    if (points.current) points.current.visible = !motion.reduced;
    material.uniforms.uTime.value = room.t;
    // Point size in pixels per metre at 1 m: the drawing buffer's height over the lens.
    material.uniforms.uScale.value = state.gl.domElement.height;
  });

  return <points ref={points} geometry={geometry} material={material} renderOrder={3} />;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** A small seeded random, so the motes sit in the same places every load. */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
