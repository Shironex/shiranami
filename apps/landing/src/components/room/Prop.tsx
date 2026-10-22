import { useGLTF } from '@react-three/drei';
import { useThree, type ThreeElements } from '@react-three/fiber';
import { Component, createContext, Suspense, useContext, useMemo, type ReactNode } from 'react';
import type { WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/** Prop names with a real file at /room/models/<name>.glb. Filled by the page. */
export const ModelsContext = createContext<ReadonlySet<string>>(new Set());

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
  | 'books';

type PropProps = ThreeElements['group'] & {
  name: PropName;
  /** The blockout, shown while there is no GLB, while it loads, or if it fails. */
  children: ReactNode;
};

/**
 * One prop of the room. Renders /room/models/<name>.glb when that file exists,
 * otherwise the blockout passed as children. Animations look their parts up
 * by node name (`platter`, `tonearm`, ...), so blockouts and GLBs must use the
 * same names. Origin at the bottom centre, metres, +Y up, front facing +Z.
 */
export function Prop({ name, children, ...group }: PropProps) {
  const hasModel = useContext(ModelsContext).has(name);
  return (
    <group name={name} {...group}>
      {hasModel ? (
        <Fallback fallback={children}>
          <Suspense fallback={children}>
            <Glb url={`/room/models/${name}.glb`} />
          </Suspense>
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

function Glb({ url }: { url: string }) {
  const gl = useThree(state => state.gl);
  // No Draco (meshopt instead), so nothing is fetched from a decoder CDN.
  // drei's GLTFLoader comes from three-stdlib, typed against its own KTX2Loader;
  // three's own loader fits it at runtime.
  const { scene } = useGLTF(url, false, true, loader =>
    loader.setKTX2Loader(ktx2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0])
  );
  // The second deck reuses the turntable, so each instance gets its own copy.
  const copy = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={copy} />;
}

/** Falls back to the blockout when a GLB fails to load or parse. */
class Fallback extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[room] model failed, keeping the blockout', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
