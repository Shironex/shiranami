import { useAnimations, useGLTF } from '@react-three/drei';
import { useThree, type ThreeElements } from '@react-three/fiber';
import {
  Component,
  createContext,
  Suspense,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type AnimationAction,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { shadeBaked } from './baked';

/** Prop names with a real file at /room/models/<name>.glb. Filled by the page. */
export const ModelsContext = createContext<ReadonlySet<string>>(new Set());

/**
 * Model names that are in the scene or have failed (and kept their blockout).
 * The loader holds the room back until every model has settled.
 */
export const settledModels = new Set<string>();

export type PropName =
  | 'turntable'
  | 'record'
  | 'sleeve'
  | 'shelf'
  | 'radio'
  | 'speaker'
  | 'desk'
  | 'mascot'
  | 'window'
  | 'lamp'
  | 'stool'
  | 'plant'
  | 'books'
  | 'mug'
  | CornerProp;

/** The listening corner's props, left of the desk. They load after the room is in (LATE). */
export type CornerProp =
  | 'reading_armchair'
  | 'side_table_with_mug'
  | 'arc_floor_lamp'
  | 'cassette_deck_cabinet'
  | 'vinyl_crate'
  | 'guitar_on_stand'
  | 'monstera_plant'
  | 'wall_record_shelf';

/**
 * Models fetched only once the room has shown: the loader does not wait for
 * them, so they never hold back the first view. They stay hidden (no
 * blockout) until their shaders are compiled, then appear.
 */
export const LATE: ReadonlySet<string> = new Set<CornerProp>([
  'reading_armchair',
  'side_table_with_mug',
  'arc_floor_lamp',
  'cassette_deck_cabinet',
  'vinyl_crate',
  'guitar_on_stand',
  'monstera_plant',
  'wall_record_shelf',
]);

/** True once the room has shown; late models start loading then. Filled by RoomCanvas. */
export const RoomReadyContext = createContext(false);

/** Called once the GLB is in the scene, with its copy and its clips by name. */
export type OnModel = (model: Object3D, actions: Record<string, AnimationAction | null>) => void;

type PropProps = ThreeElements['group'] & {
  name: PropName;
  /** The blockout, shown while there is no GLB, while it loads, or if it fails. */
  children: ReactNode;
  onModel?: OnModel;
};

/**
 * One prop of the room. Renders /room/models/<name>.glb when that file exists,
 * otherwise the blockout passed as children. Animations look their parts up
 * by node name (`platter`, `tonearm`, ...), so blockouts and GLBs must use the
 * same names. Origin at the bottom centre, metres, +Y up, front facing +Z.
 */
export function Prop({ name, children, onModel, ...group }: PropProps) {
  const hasModel = useContext(ModelsContext).has(name);
  const ready = useContext(RoomReadyContext);
  const late = LATE.has(name);
  return (
    <group name={name} {...group}>
      {hasModel ? (
        <Fallback name={name} fallback={children}>
          {/* A late model shows nothing while it loads: no blockout popping in after the room. */}
          {(!late || ready) && (
            <Suspense fallback={late ? null : children}>
              <Glb name={name} onModel={onModel} late={late} />
            </Suspense>
          )}
        </Fallback>
      ) : (
        children
      )}
    </group>
  );
}

let ktx2: KTX2Loader | null = null;

function ktx2Loader(gl: WebGLRenderer): KTX2Loader {
  // three bundles its own basis transcoder (hashed into /_astro), so it always
  // matches this three version; no transcoder path to keep in sync.
  ktx2 ??= new KTX2Loader().detectSupport(gl);
  return ktx2;
}

function Glb({ name, onModel, late }: { name: PropName; onModel?: OnModel; late: boolean }) {
  const gl = useThree(state => state.gl);
  const camera = useThree(state => state.camera);
  const room = useThree(state => state.scene);
  const url = `/room/models/${name}.glb`;
  // No Draco (meshopt instead), so nothing is fetched from a decoder CDN.
  // drei's GLTFLoader comes from three-stdlib, typed against its own KTX2Loader;
  // three's own loader fits it at runtime.
  const { scene, animations } = useGLTF(url, false, true, loader =>
    loader.setKTX2Loader(ktx2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0])
  );
  // The second deck reuses the turntable, so each instance gets its own copy.
  // SkeletonUtils rebinds a skinned mesh to the copy's own bones.
  const copy = useMemo(() => clone(scene), [scene]);
  // Static props carry a baked light texture: let it shade the realtime light too.
  useLayoutEffect(() => shadeBaked(copy), [copy]);
  const { actions } = useAnimations(animations, copy);
  useLayoutEffect(() => onModel?.(copy, actions), [copy, actions, onModel]);
  useLayoutEffect(() => {
    settledModels.add(name);
  }, [name]);
  // The room is already on screen: build a late model's shaders in parallel
  // first (KHR_parallel_shader_compile), so its first draw does not stall.
  useLayoutEffect(() => {
    if (!late) return;
    let live = true;
    const job = warm(gl, copy, camera, room);
    copy.visible = false;
    const show = () => {
      if (live) copy.visible = true;
    };
    job.then(show, show);
    return () => {
      live = false;
    };
  }, [late, copy, gl, camera, room]);
  return <primitive object={copy} />;
}

/**
 * Compiles a model's programs as the composer will draw them. The effect
 * composer renders the scene into its own target, where three keys programs
 * without tone mapping and in linear colour, so compile against a target too;
 * against the screen the programs would not match and would build again.
 */
async function warm(gl: WebGLRenderer, model: Object3D, camera: Camera, scene: Scene) {
  const target = new WebGLRenderTarget(1, 1);
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  // compile() runs now, before the first await, so the target is set while it does.
  const job = gl.compileAsync(model, camera, scene);
  gl.setRenderTarget(previous);
  try {
    await job;
  } finally {
    target.dispose();
  }
}

/** Falls back to the blockout when a GLB fails to load or parse. */
class Fallback extends Component<
  { name: PropName; fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    settledModels.add(this.props.name);
    console.warn('[room] model failed, keeping the blockout', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
