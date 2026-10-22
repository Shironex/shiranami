import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { useMemo } from 'react';

/** The site's film grain strength (--grain in global.css), so the room matches the page. */
function siteGrain(): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grain'));
  return Number.isFinite(value) ? value : 0.04;
}

/**
 * One composer pass over the room: bloom on what glows past white (the lamp
 * shade, the moon, the radio dial, the string lights), AgX tone mapping (the
 * composer takes it over from the renderer), a soft vignette and fine grain.
 */
export function Effects() {
  const grain = useMemo(siteGrain, []);
  return (
    <EffectComposer multisampling={4}>
      {/* Only HDR values bloom: emissive parts are pushed past 1, the rest of the room stays under. */}
      <Bloom
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.25}
        intensity={0.45}
        radius={0.6}
      />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.35} darkness={0.45} />
      {/* Moving grain at the site's --grain strength (soft light reads weaker, hence the factor); the page's static grain still sits on top. */}
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={grain * 2.5} />
    </EffectComposer>
  );
}
