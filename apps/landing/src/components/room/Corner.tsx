import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, type Mesh, MeshStandardMaterial, type PointLight } from 'three';
import { BlobShadow, Books } from './Dressing';
import { type CornerProp, type OnModel, Prop } from './Prop';
import { mat } from './props';
import { near } from './progress';

// The listening corner, left of the desk: an armchair under an arc lamp with
// a side table and mug, the cassette deck and a record shelf against the back
// wall, a vinyl crate, a guitar and a monstera. The models come from Maquette
// (project shiranami) and load after the room shows (Prop's LATE). They are
// not in the bake, so each gets a soft blob shadow on the floor instead.
// The hero and lyrics stops see the corner behind their copy, so it stays low
// and dim: nothing bright behind the headline.

type GroupProps = ThreeElements['group'];
type Vec3 = [number, number, number];

/** Multiplies every material of a model by `color`; each copy gets its own materials. */
function tinted(color: string): OnModel {
  const by = new Color(color);
  return model =>
    model.traverse(child => {
      const mesh = child as Mesh;
      if (!(mesh.material instanceof MeshStandardMaterial)) return;
      const own = mesh.material.clone();
      own.color.multiply(by);
      mesh.material = own;
    });
}

interface Piece {
  name: CornerProp;
  at: Vec3;
  /** Rotation about Y, radians. */
  turn?: number;
  /** Blockout box (width, height, depth), shown only if the GLB is missing or fails. */
  box: Vec3;
  /** Quiets a loud scan into the room's palette (see tinted). */
  onModel?: OnModel;
  /** Blob shadow on the floor: size and opacity; none for wall pieces. */
  shadow?: { size: [number, number]; opacity: number };
}

const PIECES: readonly Piece[] = [
  {
    name: 'monstera_plant',
    at: [-2.98, 0, 0.38],
    turn: 0.6,
    box: [0.8, 0.95, 0.7],
    shadow: { size: [0.8, 0.7], opacity: 0.45 },
  },
  {
    name: 'guitar_on_stand',
    at: [-2.3, 0, 0.2],
    turn: 0.2,
    box: [0.4, 1.05, 0.3],
    shadow: { size: [0.5, 0.4], opacity: 0.4 },
  },
  {
    name: 'cassette_deck_cabinet',
    at: [-1.72, 0, 0.21],
    onModel: tinted('#9d8fae'),
    box: [0.7, 0.4, 0.36],
    shadow: { size: [0.85, 0.5], opacity: 0.4 },
  },
  {
    name: 'wall_record_shelf',
    at: [-1.72, 0.98, 0.125],
    box: [0.9, 0.19, 0.25],
  },
  {
    name: 'reading_armchair',
    at: [-2.5, 0, 0.64],
    turn: 0.35,
    box: [1.02, 0.82, 0.78],
    shadow: { size: [1.2, 1.0], opacity: 0.5 },
  },
  {
    name: 'side_table_with_mug',
    at: [-1.88, 0, 0.74],
    box: [0.48, 0.44, 0.48],
    shadow: { size: [0.6, 0.6], opacity: 0.4 },
  },
  {
    name: 'vinyl_crate',
    at: [-1.3, 0, 0.86],
    turn: -0.3,
    box: [0.42, 0.34, 0.38],
    shadow: { size: [0.6, 0.55], opacity: 0.4 },
  },
];

/** The arc lamp's base on the floor and the turn that swings its shade over the armchair. */
const ARC = { at: [-2.74, 0, 0.79] as Vec3, turn: 0.6 };
/** The shade's underside in the lamp's own space (arc_floor_lamp.glb, metres). */
const SHADE: Vec3 = [0.33, 1.2, 0];
/** Warm reading light under the shade: dimmer than the desk lamp, short reach. */
const ARC_LIGHT = 2.2;
/** The lamp's cream shade sits behind the headline: keep its outside quiet. */
const quietShade = tinted('#8c8090');

export function Corner() {
  return (
    <group>
      {PIECES.map(({ name, at, turn = 0, onModel, box, shadow }) => (
        <group key={name}>
          <Prop name={name} position={at} rotation={[0, turn, 0]} onModel={onModel}>
            <mesh position={[0, box[1] / 2, 0]} material={mat.violetDark}>
              <boxGeometry args={box} />
            </mesh>
          </Prop>
          {shadow && (
            <BlobShadow
              position={[at[0], 0.004, at[2]]}
              rotation={[0, turn, 0]}
              size={shadow.size}
              opacity={shadow.opacity}
            />
          )}
        </group>
      ))}
      {/* A short stack of books on the record shelf: the desk's books.glb again, no new bytes. */}
      <Books position={[-1.95, 0.995, 0.13]} rotation={[0, -0.15, 0]} />
      <ArcLamp position={ARC.at} rotation={[0, ARC.turn, 0]} />
    </group>
  );
}

function ArcLamp(group: GroupProps) {
  const light = useRef<PointLight>(null);
  const bulb = useMemo(
    () =>
      new MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffc477', emissiveIntensity: 2.2 }),
    []
  );

  useFrame(() => {
    // The room lights go down for the last stop, like the desk lamp.
    const dim = 1 - near(5, 0.9) * 0.55;
    bulb.emissiveIntensity = 2.2 * dim;
    if (light.current) light.current.intensity = ARC_LIGHT * dim;
  });

  return (
    <group {...group}>
      <Prop name="arc_floor_lamp" onModel={quietShade}>
        <mesh position={[-0.29, 0.8, 0]} material={mat.violet}>
          <cylinderGeometry args={[0.012, 0.012, 1.6, 8]} />
        </mesh>
      </Prop>
      {/* The bulb faces down only: seen from the room it is hidden, seen from below it glows. */}
      <mesh position={SHADE} rotation={[Math.PI / 2, 0, 0]} material={bulb}>
        <circleGeometry args={[0.07, 24]} />
      </mesh>
      <BlobShadow position={[-0.29, 0.004, 0]} size={[0.4, 0.4]} opacity={0.4} />
      {/* Inside the shade, so it lights the chair and the shade's inside, not its outside. */}
      <pointLight
        ref={light}
        position={[SHADE[0], SHADE[1] + 0.04, SHADE[2]]}
        color="#ffbf7a"
        intensity={ARC_LIGHT}
        distance={2.4}
        decay={2}
      />
    </group>
  );
}
