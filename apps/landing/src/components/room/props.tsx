import { RoundedBox, useTexture } from '@react-three/drei';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type AnimationAction,
  Color,
  DoubleSide,
  type Group,
  type InstancedMesh,
  type Mesh,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  type PointLight,
  type SkinnedMesh,
  SRGBColorSpace,
} from 'three';
import { BlobShadow } from './Dressing';
import { music } from './music';
import { type OnModel, Prop } from './Prop';
import { near, ramp, room } from './progress';

// Blockouts for every prop, built to the sizes in props.txt, and the
// animations that drive their named parts. Each blockout's origin is the
// prop's bottom centre with its front facing +Z, same as the GLBs will be.

type GroupProps = ThreeElements['group'];

const m = (color: string, extra: Partial<MeshStandardMaterial> = {}) =>
  Object.assign(new MeshStandardMaterial({ color, roughness: 0.85 }), extra);

export const mat = {
  wood: m('#4a3540'),
  woodDark: m('#33252e'),
  violet: m('#3a2d57'),
  violetDark: m('#251d38'),
  plastic: m('#4a3a52', { roughness: 0.6 }),
  black: m('#151217', { roughness: 0.45 }),
  lavender: m('#b9a3e3'),
  cream: m('#efe2c2'),
  metal: m('#bfbac6', { metalness: 0.6, roughness: 0.35 }),
  hair: m('#8a5cd6', { roughness: 0.7 }),
  skin: m('#f2d9cf'),
  wall: m('#1d1830', { roughness: 1 }),
  floor: m('#1f1826', { roughness: 0.75 }),
  rug: m('#2c2249', { roughness: 1 }),
};

const glow = (color: string, intensity: number) =>
  new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity });

/** The first descendant with that name: a blockout part or a GLB node. */
function part(root: Object3D | null, name: string): Object3D | undefined {
  // ponytail: tree walk each frame; the props have a few dozen nodes at most.
  return root?.getObjectByName(name) ?? undefined;
}

/** Sets the glow on a named part's materials, blockout or GLB alike. */
function setGlow(node: Object3D | undefined, intensity: number) {
  // ponytail: traverses per frame; the parts are one or two meshes.
  node?.traverse(child => {
    const material = (child as Mesh).material;
    if (material instanceof MeshStandardMaterial) material.emissiveIntensity = intensity;
  });
}

// ---------------------------------------------------------------- turntable

const TONEARM_PLAY = -0.56; // radians around Y from rest (arm along +Z) onto the record
/** Platter top centre of turntable.glb, where the record's bottom face sits. */
const RECORD_AT = [-0.0301, 0.13, 0.0061] as const;
const LABEL_B = new Color('#dfca7d');

/** Glossier vinyl than the GLB's 0.45, so the lamp catches the grooves. */
const vinylSheen: OnModel = model => {
  const disc = model.getObjectByName('disc') as Mesh | undefined;
  if (disc?.material instanceof MeshStandardMaterial) disc.material.roughness = 0.35;
};

/** Deck B's record gets its own cream label; the GLB's label is lavender. */
const creamLabel: OnModel = (model, actions) => {
  vinylSheen(model, actions);
  const label = model.getObjectByName('label') as Mesh | undefined;
  if (label?.material instanceof MeshStandardMaterial) {
    const tinted = label.material.clone();
    tinted.color.copy(LABEL_B);
    label.material = tinted;
  }
};

function TurntableBlockout() {
  return (
    <>
      <RoundedBox
        args={[0.46, 0.08, 0.37]}
        radius={0.012}
        position={[0, 0.06, 0]}
        material={mat.wood}
      />
      {[-1, 1].flatMap(x =>
        [-1, 1].map(z => (
          <mesh key={`${x}${z}`} position={[x * 0.19, 0.01, z * 0.14]} material={mat.black}>
            <cylinderGeometry args={[0.025, 0.025, 0.02, 16]} />
          </mesh>
        ))
      )}
      <group name="platter" position={[RECORD_AT[0], 0.1, RECORD_AT[2]]}>
        <mesh position={[0, 0.015, 0]} material={mat.black}>
          <cylinderGeometry args={[0.15, 0.15, 0.03, 48]} />
        </mesh>
      </group>
      <group name="tonearm" position={[0.17, 0.1, -0.11]}>
        <mesh position={[0, 0.02, 0]} material={mat.metal}>
          <cylinderGeometry args={[0.018, 0.022, 0.04, 16]} />
        </mesh>
        <mesh position={[0, 0.035, 0.11]} material={mat.metal}>
          <boxGeometry args={[0.008, 0.008, 0.22]} />
        </mesh>
        <mesh position={[0, 0.03, 0.225]} material={mat.black}>
          <boxGeometry args={[0.02, 0.012, 0.03]} />
        </mesh>
      </group>
      <mesh position={[-0.19, 0.07, 0.186]} material={glow('#f5e3b5', 2)}>
        <sphereGeometry args={[0.005, 8, 8]} />
      </mesh>
    </>
  );
}

function RecordBlockout({ label }: { label: string }) {
  return (
    <>
      <mesh name="disc" position={[0, 0.002, 0]} material={mat.black}>
        <cylinderGeometry args={[0.15, 0.15, 0.004, 48]} />
      </mesh>
      <mesh name="label" position={[0, 0.0045, 0]} material={m(label)}>
        <cylinderGeometry args={[0.05, 0.05, 0.001, 32]} />
      </mesh>
      {/* A small mark on the label so the spin reads. */}
      <mesh position={[0.03, 0.0052, 0]} material={mat.cream}>
        <boxGeometry args={[0.018, 0.0005, 0.006]} />
      </mesh>
    </>
  );
}

/**
 * A turntable with its record. `deck` picks the animation: A is the room's
 * own deck, B appears only around the crossfade stop and takes over.
 */
export function Turntable({ deck, ...group }: GroupProps & { deck: 'A' | 'B' }) {
  const root = useRef<Group>(null);
  const record = useRef<Group>(null);
  const spin = useRef(1);

  useFrame((_, delta) => {
    const shown = deck === 'A' ? 1 : near(4, 0.9);
    // Crossfade: B's arm swings on and B spins up while A spins down; once B
    // has gone again (past the crossfade stop), A plays on.
    const fade = ramp(3.75, 4.25) * near(4, 0.9);
    const target = deck === 'A' ? 1 - fade : fade;
    spin.current += (target - spin.current) * Math.min(1, delta * 3);

    const g = root.current;
    if (!g) return;
    g.visible = shown > 0.01;
    g.scale.setScalar(Math.max(shown, 0.001));
    const step = spin.current * delta * 3.49; // 33⅓ rpm
    const platter = part(g, 'platter');
    if (platter) platter.rotation.y -= step;
    if (record.current) record.current.rotation.y -= step;
    const arm = part(g, 'tonearm');
    if (arm) arm.rotation.y = TONEARM_PLAY * (deck === 'A' ? 1 : spin.current);
  });

  return (
    <group ref={root} {...group}>
      <Prop name="turntable">
        <TurntableBlockout />
      </Prop>
      {/* Deck B comes and goes, so it is not in the desk's bake: a blob grounds it instead. */}
      {deck === 'B' && <BlobShadow size={[0.6, 0.48]} opacity={0.45} position={[0, 0.003, 0]} />}
      <group ref={record} position={RECORD_AT}>
        <Prop name="record" onModel={deck === 'B' ? creamLabel : vinylSheen}>
          <RecordBlockout label={deck === 'A' ? '#b9a3e3' : '#efe2c2'} />
        </Prop>
      </group>
    </group>
  );
}

// -------------------------------------------------------------------- radio

export function Radio(group: GroupProps) {
  const root = useRef<Group>(null);
  const dial = useMemo(() => glow('#f4d9a0', 0.6), []);

  useFrame(() => {
    const g = root.current;
    // Scrubbed by scroll on the way into the radio stop, across four stations.
    const sweep = ramp(1.5, 2.6);
    const needle = part(g, 'needle');
    if (needle) needle.rotation.z = 0.9 - sweep * 1.8;
    const knob = part(g, 'knob_right');
    if (knob) knob.rotation.z = -sweep * Math.PI * 2;
    setGlow(part(g, 'dial'), 0.6 + near(2) * 1.6);
  });

  return (
    <group ref={root} {...group}>
      <Prop name="radio">
        <RoundedBox
          args={[0.36, 0.2, 0.17]}
          radius={0.025}
          position={[0, 0.1, 0]}
          material={mat.plastic}
        />
        <mesh position={[-0.085, 0.105, 0.086]} material={mat.violetDark}>
          <boxGeometry args={[0.15, 0.13, 0.004]} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <mesh key={i} position={[-0.085, 0.055 + i * 0.02, 0.089]} material={mat.metal}>
            <boxGeometry args={[0.14, 0.004, 0.003]} />
          </mesh>
        ))}
        <mesh name="dial" position={[0.085, 0.13, 0.086]} material={dial}>
          <boxGeometry args={[0.15, 0.06, 0.004]} />
        </mesh>
        <group name="needle" position={[0.085, 0.102, 0.09]}>
          <mesh position={[0, 0.026, 0]} material={mat.lavender}>
            <boxGeometry args={[0.003, 0.052, 0.002]} />
          </mesh>
        </group>
        {(['knob_left', 'knob_right'] as const).map((name, i) => (
          <group key={name} name={name} position={[0.04 + i * 0.09, 0.05, 0.088]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mat.metal}>
              <cylinderGeometry args={[0.017, 0.017, 0.014, 24]} />
            </mesh>
            <mesh position={[0, 0.009, 0.008]} material={mat.cream}>
              <boxGeometry args={[0.002, 0.012, 0.001]} />
            </mesh>
          </group>
        ))}
      </Prop>
    </group>
  );
}

// ------------------------------------------------------------------ speaker

export function Speaker(group: GroupProps) {
  const root = useRef<Group>(null);

  useFrame(() => {
    const cone = part(root.current, 'woofer');
    // A soft pulse on the beat: the cone and cap move a few millimetres. With
    // the music on it kicks on the music's beat, otherwise at 80 bpm.
    const beats = music.beats();
    const pulse =
      beats === null ? Math.max(0, Math.sin(room.t * 8.38)) : Math.exp(-(beats % 1) * 7);
    if (cone) cone.scale.z = 1 + pulse * 0.35;
  });

  return (
    <group ref={root} {...group}>
      <Prop name="speaker">
        <RoundedBox
          args={[0.22, 0.38, 0.2]}
          radius={0.015}
          position={[0, 0.19, 0]}
          material={mat.plastic}
        />
        <group name="woofer" position={[0, 0.13, 0.1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={mat.black}>
            <cylinderGeometry args={[0.075, 0.06, 0.012, 32]} />
          </mesh>
          <mesh material={mat.lavender}>
            <torusGeometry args={[0.078, 0.004, 8, 40]} />
          </mesh>
        </group>
        <mesh position={[0, 0.29, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={mat.black}>
          <cylinderGeometry args={[0.025, 0.025, 0.01, 24]} />
        </mesh>
      </Prop>
    </group>
  );
}

// --------------------------------------------------------------------- lamp

/**
 * lamp.glb's shade: the bright inside and rim (material `shade`) and the
 * opaque outside, lit through a little (`shade_shell`), with their glow.
 */
const SHADE_GLOW: Record<string, number> = { shade: 1.4, shade_shell: 0.55 };

function shadeGlow(root: Object3D | null): MeshStandardMaterial[] {
  const out: MeshStandardMaterial[] = [];
  root?.getObjectByName('shade')?.traverse(child => {
    const material = (child as Mesh).material;
    for (const mat of Array.isArray(material) ? material : [material]) {
      if (mat instanceof MeshStandardMaterial && mat.name in SHADE_GLOW) out.push(mat);
    }
  });
  return out;
}

/** The shade glows its own cream texture; tint that toward C0's amber. */
const warmShade: OnModel = model => {
  for (const glowing of shadeGlow(model)) glowing.emissive.set('#ffc477');
};

export function Lamp(group: GroupProps) {
  const root = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const shade = useMemo(() => Object.assign(glow('#ffd9a0', 1.4), { side: DoubleSide }), []);

  useFrame(() => {
    // The room lights go down for the last stop.
    const dim = 1 - near(5, 0.9) * 0.55;
    const glowing = shadeGlow(root.current);
    // The blockout has no `shade` material: it glows as one piece.
    if (glowing.length) for (const g of glowing) g.emissiveIntensity = SHADE_GLOW[g.name] * dim;
    else setGlow(part(root.current, 'shade'), 1.4 * dim);
    if (light.current) light.current.intensity = 3 * dim;
  });

  return (
    <group ref={root} {...group}>
      <Prop name="lamp" onModel={warmShade}>
        <mesh position={[0, 0.01, 0]} material={mat.cream}>
          <cylinderGeometry args={[0.07, 0.075, 0.02, 32]} />
        </mesh>
        <mesh position={[0, 0.15, 0]} material={mat.violet}>
          <cylinderGeometry args={[0.008, 0.008, 0.27, 12]} />
        </mesh>
        <mesh name="shade" position={[0, 0.25, 0]} material={shade}>
          <sphereGeometry args={[0.09, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </Prop>
      {/* The light is code, not model: under the shade, warm, short reach. */}
      <pointLight
        ref={light}
        position={[0, 0.2, 0.02]}
        color="#ffbf7a"
        intensity={3}
        distance={4}
        decay={2}
      />
    </group>
  );
}

// ------------------------------------------------------------------- mascot

/** sit_idle nods once every 0.75 s of clip time, deepest halfway through each. */
const NOD = 0.75;
const CLIP = 6;

export function Mascot(group: GroupProps) {
  const actions = useRef<Record<string, AnimationAction | null>>({});

  const onModel = useCallback<OnModel>((model, clips) => {
    // The skinned mesh keeps its T-pose bounds, which the seated pose leaves.
    model.traverse(child => {
      if ((child as SkinnedMesh).isSkinnedMesh) child.frustumCulled = false;
    });
    clips.sit_idle?.play();
    clips.sit_listen?.play();
    actions.current = clips;
  }, []);

  useFrame(() => {
    // Both loops are 6 s and in phase, so a weight blend is the crossfade:
    // head on her hand by default, up and listening at the lyrics and the end.
    const listen = Math.max(near(3), near(5));
    const { sit_idle: idle, sit_listen: listening } = actions.current;
    idle?.setEffectiveWeight(1 - listen);
    listening?.setEffectiveWeight(listen);
    // With the music on, the nods follow its beat (music.ts BEAT): the clip time comes
    // from the audio clock, a nod's deepest point on each beat.
    const beats = music.beats();
    if (beats !== null && idle && listening) {
      idle.time = listening.time = ((beats + 0.5) * NOD) % CLIP;
    }
  });

  // Origin on the floor under her, at the stool's origin.
  return (
    <group {...group}>
      <Prop name="mascot" onModel={onModel}>
        <mesh position={[0, 0.6, 0]} material={mat.violet}>
          <capsuleGeometry args={[0.12, 0.16, 8, 16]} />
        </mesh>
        <mesh position={[0, 0.47, 0.1]} rotation={[0.2, 0, 0]} material={mat.black}>
          <boxGeometry args={[0.2, 0.06, 0.2]} />
        </mesh>
        {[-0.05, 0.05].map(x => (
          <mesh key={x} position={[x, 0.22, 0.2]} material={mat.lavender}>
            <capsuleGeometry args={[0.035, 0.32, 4, 12]} />
          </mesh>
        ))}
        <group position={[0, 0.76, 0]}>
          <mesh position={[0, 0.12, 0]} material={mat.skin}>
            <sphereGeometry args={[0.12, 32, 24]} />
          </mesh>
          <mesh position={[0, 0.13, -0.025]} scale={[1.08, 1.05, 1.05]} material={mat.hair}>
            <sphereGeometry args={[0.12, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          </mesh>
          <mesh position={[0, 0.0, -0.08]} material={mat.hair}>
            <capsuleGeometry args={[0.11, 0.25, 6, 16]} />
          </mesh>
          <mesh position={[0, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} material={mat.black}>
            <torusGeometry args={[0.135, 0.012, 8, 32, Math.PI]} />
          </mesh>
          {[-1, 1].map(s => (
            <mesh
              key={s}
              position={[s * 0.13, 0.11, 0]}
              rotation={[0, 0, Math.PI / 2]}
              material={mat.black}
            >
              <cylinderGeometry args={[0.045, 0.045, 0.035, 24]} />
            </mesh>
          ))}
        </group>
      </Prop>
    </group>
  );
}

export function Stool(group: GroupProps) {
  return (
    <Prop {...group} name="stool">
      <mesh position={[0, 0.41, 0]} material={mat.violetDark}>
        <cylinderGeometry args={[0.17, 0.16, 0.08, 32]} />
      </mesh>
      {[0, 1, 2, 3].map(i => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.11, 0.185, Math.sin(a) * 0.11]}
            material={mat.wood}
          >
            <cylinderGeometry args={[0.014, 0.01, 0.37, 8]} />
          </mesh>
        );
      })}
    </Prop>
  );
}

// -------------------------------------------------------- shelf and sleeve

const SPINE_COLORS = ['#3a2d57', '#efe2c2', '#3f8f8c', '#232027', '#6c55a3', '#b9a3e3', '#2d2440'];
const SHELF_BOARDS = [0.085, 0.568, 1.052, 1.44]; // board heights, the spines stand on the first three
const SPINE_PITCH = 0.0145;
const GAP_ROW = 2; // the upper row, where the sleeve comes out
const GAP_X = 0.03; // centre of the gap, shelf space (shelf.glb's sleeve_slot)

function rand(i: number) {
  const x = Math.sin(i * 91.7) * 43758.5;
  return x - Math.floor(x);
}

/** Static spines as one instanced mesh, leaving out the gap and its two neighbours. */
function Spines() {
  const ref = useRef<InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { x: number; y: number; h: number; color: string }[] = [];
    [0, 1, 2].forEach(row => {
      const count = row === 0 ? 17 : 33; // lower row half full
      for (let k = 0; k < count; k++) {
        const x = -0.245 + 0.008 + k * SPINE_PITCH;
        if (row === GAP_ROW && Math.abs(x - GAP_X) < SPINE_PITCH * 1.6) continue;
        const i = row * 50 + k;
        out.push({
          x,
          y: SHELF_BOARDS[row] + 0.015,
          h: 0.27 + rand(i) * 0.05,
          color: SPINE_COLORS[Math.floor(rand(i + 7) * SPINE_COLORS.length)],
        });
      }
    });
    return out;
  }, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    items.forEach((s, i) => {
      o.position.set(s.x, s.y + s.h / 2, 0.005);
      o.scale.set(1, s.h, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(s.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]}>
      <boxGeometry args={[0.012, 1, 0.31]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

function ShelfBlockout() {
  const y = SHELF_BOARDS[GAP_ROW] + 0.015;
  const lean = (side: -1 | 1, name: string, color: string) => (
    // Pivot at the bottom corner on the gap side, so the spine tips into it.
    <group name={name} position={[GAP_X + side * SPINE_PITCH * 1.6 - side * 0.006, y, 0.005]}>
      <mesh position={[side * 0.006, 0.15, 0]} material={m(color)}>
        <boxGeometry args={[0.012, 0.3, 0.31]} />
      </mesh>
    </group>
  );
  return (
    <>
      <group name="frame">
        {[-1, 1].map(s => (
          <mesh key={s} position={[s * 0.26, 0.775, 0]} material={mat.wood}>
            <boxGeometry args={[0.03, 1.55, 0.34]} />
          </mesh>
        ))}
        {[...SHELF_BOARDS, 1.535].map(h => (
          <mesh key={h} position={[0, h, 0]} material={mat.wood}>
            <boxGeometry args={[0.55, 0.03, 0.34]} />
          </mesh>
        ))}
        <mesh position={[0, 0.775, -0.165]} material={mat.woodDark}>
          <boxGeometry args={[0.52, 1.55, 0.01]} />
        </mesh>
        <mesh position={[0, 0.035, 0]} material={mat.woodDark}>
          <boxGeometry args={[0.55, 0.07, 0.32]} />
        </mesh>
      </group>
      <Spines />
      {lean(-1, 'spine_left', '#6c55a3')}
      {lean(1, 'spine_right', '#efe2c2')}
    </>
  );
}

export function Shelf(group: GroupProps) {
  const root = useRef<Group>(null);
  const sleeve = useRef<Group>(null);

  useFrame(() => {
    const w = near(1, 0.8);
    const g = root.current;
    // Neighbours lean a few degrees into the gap while the sleeve is out.
    const l = part(g, 'spine_left');
    const r = part(g, 'spine_right');
    if (l) l.rotation.z = -0.09 * w;
    if (r) r.rotation.z = 0.09 * w;

    // The sleeve slides forward out of the row, then turns to face the room.
    const out = MathUtils.smoothstep(w, 0, 0.6);
    const turn = MathUtils.smoothstep(w, 0.4, 1);
    const s = sleeve.current;
    if (s) {
      s.position.set(GAP_X - 0.12 * turn, SHELF_BOARDS[GAP_ROW] + 0.015 + 0.03 * turn, 0.36 * out);
      s.rotation.y = (Math.PI / 2) * (1 - turn) - 0.6 * turn;
    }
  });

  return (
    <group ref={root} {...group}>
      <Prop name="shelf">
        <ShelfBlockout />
      </Prop>
      <group ref={sleeve}>
        <Prop name="sleeve" onModel={litSleeveFront}>
          <mesh position={[0, 0.1575, 0]} material={m('#3a2d57')}>
            <boxGeometry args={[0.315, 0.315, 0.003]} />
          </mesh>
        </Prop>
        {/* The app screenshot on the sleeve front, code side so any sleeve GLB works. */}
        <Suspense fallback={null}>
          <SleeveScreen />
        </Suspense>
      </group>
    </group>
  );
}

/**
 * The sleeve front glows its own card texture a little, so the screenshot's
 * frame reads at the library stop even though the shelf sits in shadow.
 */
const litSleeveFront: OnModel = model => {
  model.traverse(child => {
    const material = (child as Mesh).material;
    if (material instanceof MeshStandardMaterial && material.name === 'sleeve_front') {
      material.emissive.set('#ffffff');
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0.55;
    }
  });
};

/** The capture is a dark UI; lift it so it reads at sleeve size in a dark room. */
const SCREEN_GAIN = 1.7;

function SleeveScreen() {
  const map = useTexture('/room/textures/library-sleeve.jpg', t => {
    t.colorSpace = SRGBColorSpace;
  });
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map,
        color: new Color(SCREEN_GAIN, SCREEN_GAIN, SCREEN_GAIN),
        transparent: true,
        opacity: 0,
        toneMapped: false,
        side: DoubleSide,
      }),
    [map]
  );
  // Fades in once the sleeve has turned to face the camera.
  useFrame(() => {
    material.opacity = MathUtils.smoothstep(near(1, 0.8), 0.75, 1);
  });
  return (
    <mesh position={[0, 0.1575, 0.0025]} material={material}>
      <planeGeometry args={[0.27, 0.169]} />
    </mesh>
  );
}

// ------------------------------------------------------------- static props

export function Desk(group: GroupProps) {
  return (
    <Prop {...group} name="desk">
      <RoundedBox
        args={[2.4, 0.04, 0.7]}
        radius={0.015}
        position={[0, 0.73, 0]}
        material={mat.wood}
      />
      {[-1, 1].flatMap(x =>
        [-1, 1].map(z => (
          <mesh key={`${x}${z}`} position={[x * 1.12, 0.355, z * 0.29]} material={mat.woodDark}>
            <cylinderGeometry args={[0.03, 0.022, 0.71, 12]} />
          </mesh>
        ))
      )}
      <mesh position={[0, 0.2, -0.02]} material={mat.woodDark}>
        <boxGeometry args={[2.2, 0.025, 0.6]} />
      </mesh>
      <mesh position={[0.85, 0.64, 0.02]} material={mat.woodDark}>
        <boxGeometry args={[0.5, 0.14, 0.64]} />
      </mesh>
      <mesh position={[0.85, 0.64, 0.345]} material={mat.lavender}>
        <sphereGeometry args={[0.012, 12, 8]} />
      </mesh>
    </Prop>
  );
}

export function WindowFrame(group: GroupProps) {
  // Opening 1.20 x 1.00 m inside a 1.40 x 1.15 m frame, bottom on the sill.
  return (
    <Prop {...group} name="window">
      <group name="frame">
        {[-1, 1].map(s => (
          <mesh key={s} position={[s * 0.65, 0.575, 0.0]} material={mat.violetDark}>
            <boxGeometry args={[0.1, 1.15, 0.12]} />
          </mesh>
        ))}
        <mesh position={[0, 1.115, 0]} material={mat.violetDark}>
          <boxGeometry args={[1.4, 0.07, 0.12]} />
        </mesh>
        <mesh position={[0, 0.04, 0]} material={mat.violetDark}>
          <boxGeometry args={[1.4, 0.08, 0.12]} />
        </mesh>
        <RoundedBox
          args={[1.5, 0.04, 0.2]}
          radius={0.012}
          position={[0, 0.02, 0.1]}
          material={mat.violet}
        />
      </group>
      <mesh name="mullion" position={[0, 0.58, 0]} material={mat.violetDark}>
        <boxGeometry args={[0.03, 1.0, 0.06]} />
      </mesh>
    </Prop>
  );
}
