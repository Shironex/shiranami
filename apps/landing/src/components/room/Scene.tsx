import { useMemo } from 'react';
import {
  AdditiveBlending,
  MeshBasicMaterial,
  NoColorSpace,
  Shape,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { Dust, Moonbeam, MoonPool } from './Atmosphere';
import { bakedSurface } from './baked';
import { BlobShadow, Books, Mug, Plant, Poster, StringLights } from './Dressing';
import { GlassLyrics } from './Overlays';
import {
  Desk,
  Lamp,
  Mascot,
  Radio,
  Shelf,
  Speaker,
  Stool,
  Turntable,
  WindowFrame,
  mat,
} from './props';
import { Sea } from './Sea';

// The room layout, after concept C0. Metres; the window wall is z = 0 and the
// room extends toward +Z. Desk top at 0.75. The Blender bake (bake_light.py,
// LAYOUT) lays the static props out the same way: move a static prop here and
// re-run the bake, or its baked shadows stay where it was.

const DESK_TOP = 0.75;
const MASCOT_AT = [1.27, 0, 0.5] as const;
const WINDOW = { x: 0.45, bottom: 0.95, width: 1.4, height: 1.15 };
const ROOM = { left: -3.2, right: 2.4, height: 2.7, depth: 6 };

const LIGHTS_FROM = new Vector3(WINDOW.x - 0.72, WINDOW.bottom + WINDOW.height + 0.03, 0.08);
const LIGHTS_TO = new Vector3(WINDOW.x + 0.72, WINDOW.bottom + WINDOW.height + 0.03, 0.08);

/** The moonbeam, from a strip of the upper window down to the moon patch on the floor. */
const BEAM = {
  top: [
    [WINDOW.x - 0.25, WINDOW.bottom + 0.95, 0.02],
    [WINDOW.x + 0.45, WINDOW.bottom + 0.95, 0.02],
  ],
  bottom: [
    [0.45, 0.03, 1.4],
    [1.3, 0.03, 1.95],
  ],
} as const;

/** Boxes of air the dust drifts in (min and max corners): round the lamp, and in the beam. */
const DUST = {
  lamp: [
    [-0.85, 0.85, 0.3],
    [-0.1, 1.35, 0.9],
  ],
  beam: [
    [0.3, 0.4, 0.4],
    [1.2, 1.9, 1.6],
  ],
} as const;

const glass = new MeshBasicMaterial({
  color: '#9aa6ff',
  transparent: true,
  opacity: 0.05,
  blending: AdditiveBlending,
  depthWrite: false,
});

export function RoomScene() {
  return (
    <>
      <color attach="background" args={['#0b0a18']} />
      <Lights />
      <Shell />
      <Sea
        position={[WINDOW.x, WINDOW.bottom + WINDOW.height / 2, -0.08]}
        size={[WINDOW.width, WINDOW.height]}
      />
      <mesh position={[WINDOW.x - 0.3, WINDOW.bottom + 0.58, -0.005]} material={glass}>
        <planeGeometry args={[0.6, 1.0]} />
      </mesh>
      <mesh position={[WINDOW.x + 0.3, WINDOW.bottom + 0.58, -0.005]} material={glass}>
        <planeGeometry args={[0.6, 1.0]} />
      </mesh>
      <WindowFrame position={[WINDOW.x, WINDOW.bottom, 0]} />
      <StringLights from={LIGHTS_FROM} to={LIGHTS_TO} />
      {/* Across the glass, over the sea: the moon stays clear above them in the right pane. */}
      <GlassLyrics position={[WINDOW.x, WINDOW.bottom + 0.42, 0.02]} />
      {/* Fills the empty upper wall left of the window in the hero, clear of the headline. */}
      <Poster position={[-0.62, 2.02, 0]} />

      {/* desk.glb is 2.30 x 0.62 m: its back edge 2 cm off the wall. */}
      <Desk position={[0, 0, 0.33]} />
      <Speaker position={[-0.74, DESK_TOP, 0.3]} rotation={[0, 0.12, 0]} />
      <Lamp position={[-0.47, DESK_TOP, 0.47]} />
      <Radio position={[-0.13, DESK_TOP, 0.33]} />
      <Turntable deck="A" position={[0.3, DESK_TOP, 0.34]} />
      <Turntable deck="B" position={[0.82, DESK_TOP, 0.34]} />
      <Books position={[-0.98, DESK_TOP, 0.3]} rotation={[0, 0.25, 0]} />
      <Mug position={[1.0, DESK_TOP, 0.59]} rotation={[0, -2.2, 0]} />

      {/* Her right elbow rests on the desk's right end (seat 0.533, elbow at 0.75). */}
      <Stool position={MASCOT_AT} />
      <Mascot position={MASCOT_AT} rotation={[0, -0.3, 0]} />
      {/* She is not in the bake: a soft shadow on the floor around the stool instead. */}
      <BlobShadow
        position={[MASCOT_AT[0], 0.004, MASCOT_AT[2] + 0.06]}
        size={[0.75, 0.7]}
        opacity={0.35}
      />
      <Shelf position={[1.97, 0, 0.3]} />
      <Plant position={[1.93, 1.55, 0.27]} rotation={[0, 0.4, 0]} />

      {/* Rug and the moonlight falling through the window onto the floor. */}
      <mesh position={[0, 0.01, 2.4]} material={mat.rug}>
        <cylinderGeometry args={[1.25, 1.25, 0.02, 64]} />
      </mesh>
      <MoonPool
        position={[0.9, 0.022, 1.7]}
        rotation={[-Math.PI / 2, 0, -0.25]}
        size={[1.1, 1.4]}
      />
      <Moonbeam top={BEAM.top} bottom={BEAM.bottom} />
      <Dust lamp={DUST.lamp} beam={DUST.beam} />
    </>
  );
}

function Lights() {
  return (
    <>
      <ambientLight color="#6c5fa8" intensity={0.8} />
      {/* Cool moonlight through the window, slightly from the right. */}
      <directionalLight color="#8d9bff" intensity={1.5} position={[1.4, 3.2, -2.5]} />
      {/* A faint cool fill from the room side so the front faces are not black. */}
      <directionalLight color="#6a5cb0" intensity={1.0} position={[-1, 2, 4]} />
    </>
  );
}

/** The baked light textures for the floor and walls (bake_light.py). */
function useShellLight() {
  return useMemo(() => {
    const loader = new TextureLoader();
    const load = (name: string): Texture => {
      const t = loader.load(`/room/textures/light-${name}.webp`);
      t.colorSpace = NoColorSpace;
      return t;
    };
    const { left, right, height } = ROOM;
    const wall = load('wall-back');
    // The back wall's UVs are its x, y in metres (ShapeGeometry): map them onto the bake.
    wall.repeat.set(1 / (right - left), 1 / height);
    wall.offset.set(-left / (right - left), 0);
    return {
      floor: bakedSurface(mat.floor, load('floor')),
      back: bakedSurface(mat.wall, wall),
      right: bakedSurface(mat.wall, load('wall-right')),
    };
  }, []);
}

/** Floor, walls and ceiling as inward-facing planes, with the window cut out. */
function Shell() {
  const { left, right, height, depth } = ROOM;
  const light = useShellLight();
  const back = useMemo(() => {
    const wl = WINDOW.x - WINDOW.width / 2;
    const wb = WINDOW.bottom;
    const shape = new Shape()
      .moveTo(left, 0)
      .lineTo(right, 0)
      .lineTo(right, height)
      .lineTo(left, height)
      .closePath();
    const hole = new Shape()
      .moveTo(wl, wb)
      .lineTo(wl, wb + WINDOW.height)
      .lineTo(wl + WINDOW.width, wb + WINDOW.height)
      .lineTo(wl + WINDOW.width, wb)
      .closePath();
    shape.holes.push(hole);
    return shape;
  }, [left, right, height]);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(left + right) / 2, 0, depth / 2]}
        material={light.floor}
      >
        <planeGeometry args={[right - left, depth]} />
      </mesh>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[(left + right) / 2, height, depth / 2]}
        material={mat.wall}
      >
        <planeGeometry args={[right - left, depth]} />
      </mesh>
      <mesh material={light.back}>
        <shapeGeometry args={[back]} />
      </mesh>
      <mesh
        rotation={[0, Math.PI / 2, 0]}
        position={[left, height / 2, depth / 2]}
        material={mat.wall}
      >
        <planeGeometry args={[depth, height]} />
      </mesh>
      <mesh
        rotation={[0, -Math.PI / 2, 0]}
        position={[right, height / 2, depth / 2]}
        material={light.right}
      >
        <planeGeometry args={[depth, height]} />
      </mesh>
      {/* Skirting along the back wall. */}
      <mesh position={[(left + right) / 2, 0.04, 0.01]} material={mat.woodDark}>
        <boxGeometry args={[right - left, 0.08, 0.02]} />
      </mesh>
    </group>
  );
}
