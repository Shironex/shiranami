import { AdditiveBlending, MeshBasicMaterial } from 'three';
import {
  Books,
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
// room extends toward +Z. Desk top at 0.75.

const DESK_TOP = 0.75;
const MASCOT_AT = [1.27, 0, 0.5] as const;
const WINDOW = { x: 0.45, bottom: 0.95, width: 1.4, height: 1.15 };
const ROOM = { left: -3.2, right: 2.4, height: 2.7, depth: 6 };

const glass = new MeshBasicMaterial({
  color: '#9aa6ff',
  transparent: true,
  opacity: 0.05,
  blending: AdditiveBlending,
  depthWrite: false,
});
const moonPatch = new MeshBasicMaterial({
  color: '#7f86ff',
  transparent: true,
  opacity: 0.07,
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

      {/* desk.glb is 2.30 x 0.62 m: its back edge 2 cm off the wall. */}
      <Desk position={[0, 0, 0.33]} />
      <Books position={[-1.0, DESK_TOP, 0.3]} rotation={[0, 0.15, 0]} />
      <Speaker position={[-0.74, DESK_TOP, 0.3]} rotation={[0, 0.12, 0]} />
      <Lamp position={[-0.47, DESK_TOP, 0.47]} />
      <Radio position={[-0.13, DESK_TOP, 0.33]} />
      <Turntable deck="A" position={[0.3, DESK_TOP, 0.34]} />
      <Turntable deck="B" position={[0.82, DESK_TOP, 0.34]} />

      {/* Her right elbow rests on the desk's right end (seat 0.533, elbow at 0.75). */}
      <Stool position={MASCOT_AT} />
      <Mascot position={MASCOT_AT} rotation={[0, -0.3, 0]} />
      <Shelf position={[1.97, 0, 0.3]} />

      {/* Rug and the moonlight falling through the window onto the floor. */}
      <mesh position={[0, 0.01, 2.4]} material={mat.rug}>
        <cylinderGeometry args={[1.25, 1.25, 0.02, 64]} />
      </mesh>
      <mesh position={[0.9, 0.022, 1.7]} rotation={[-Math.PI / 2, 0, -0.25]} material={moonPatch}>
        <planeGeometry args={[1.0, 1.3]} />
      </mesh>
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

/** Floor, walls and ceiling as inward-facing planes, with the window cut out. */
function Shell() {
  const { left, right, height, depth } = ROOM;
  const wl = WINDOW.x - WINDOW.width / 2;
  const wr = WINDOW.x + WINDOW.width / 2;
  const wt = WINDOW.bottom + WINDOW.height;
  // Back wall in four pieces around the window opening.
  const back: [number, number, number, number][] = [
    [left, wl, 0, height],
    [wr, right, 0, height],
    [wl, wr, 0, WINDOW.bottom],
    [wl, wr, wt, height],
  ];
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(left + right) / 2, 0, depth / 2]}
        material={mat.floor}
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
      {back.map(([x0, x1, y0, y1]) => (
        <mesh key={`${x0}${y0}`} position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]} material={mat.wall}>
          <planeGeometry args={[x1 - x0, y1 - y0]} />
        </mesh>
      ))}
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
        material={mat.wall}
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
