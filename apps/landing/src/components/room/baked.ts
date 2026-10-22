import { type Mesh, MeshStandardMaterial, type Object3D, type Texture } from 'three';

// Baked light. bake_light.py (Blender pipeline) writes ambient occlusion
// times the lamp's soft shadow into a small grayscale texture per static prop,
// on a second UV set, as the glTF occlusion texture; the floor and walls get
// their own (public/room/textures/light-*.webp). three.js only applies
// occlusion to indirect light, so the patch below darkens the direct light by
// it too, which is what turns the bake into contact shadows.

/** How much of the bake darkens the direct (realtime) light, 0 to 1. */
const DIRECT = 0.65;
/** How deep the bake goes on indirect light, 0 to 1. */
const INDIRECT = 0.85;

/** Makes the material's aoMap shade its direct diffuse light as well. */
export function shadeDirect(material: MeshStandardMaterial) {
  if (material.userData.shadeDirect) return;
  material.userData.shadeDirect = true;
  material.aoMapIntensity = INDIRECT;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      #ifdef USE_AOMAP
        reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, ${DIRECT.toFixed(2)});
      #endif`
    );
  };
  material.needsUpdate = true;
}

/** Patches every baked material in a loaded model. */
export function shadeBaked(root: Object3D) {
  root.traverse(child => {
    const material = (child as Mesh).material;
    for (const m of Array.isArray(material) ? material : [material]) {
      if (m instanceof MeshStandardMaterial && m.aoMap) shadeDirect(m);
    }
  });
}

/** A copy of `base` lit by a baked light texture on its own UVs (the room shell). */
export function bakedSurface(base: MeshStandardMaterial, light: Texture): MeshStandardMaterial {
  const material = base.clone();
  material.aoMap = light;
  shadeDirect(material);
  return material;
}
