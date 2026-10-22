import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { ShaderMaterial, Vector3 } from 'three';

// The night sea behind the window. It is a flat card just outside the glass,
// but each pixel traces the view ray: rays below the horizon hit a sea plane
// far below the room, rays above it see the sky and the moon. So perspective
// and parallax come out right from every camera stop.

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uMoonDir;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float moonDot = dot(dir, uMoonDir);
    vec3 horizon = vec3(0.2, 0.21, 0.48);
    vec3 col;

    if (dir.y > 0.0) {
      // Sky: deep indigo, lighter at the horizon, a moon and its halo.
      col = mix(horizon, vec3(0.05, 0.06, 0.2), pow(dir.y * 2.0, 0.5));
      vec2 sky = dir.xz / (dir.y + 0.3) * 60.0;
      col += step(0.997, hash(floor(sky))) * 0.6 * smoothstep(0.08, 0.3, dir.y);
      col += vec3(0.45, 0.42, 0.55) * pow(max(moonDot, 0.0), 1200.0);
      col += vec3(0.2, 0.2, 0.4) * pow(max(moonDot, 0.0), 60.0) * 0.5;
      col = mix(col, vec3(1.0, 0.95, 0.82), smoothstep(0.99979, 0.99984, moonDot));
    } else {
      // Sea plane 6 m below the eye, swell rolling toward the shore (+z).
      float dist = 6.0 / -dir.y;
      vec2 p = cameraPosition.xz + dir.xz * dist;
      float near = exp(-dist * 0.018);
      col = mix(horizon * 0.8, vec3(0.04, 0.07, 0.2), near);

      // White crests: one band per wave, broken up along its length. They
      // fade into the haze before they get thinner than a pixel.
      float phase = p.y * 0.9 + uTime * 0.7 + noise(vec2(p.x * 0.1, p.y * 0.08)) * 5.0;
      float wave = sin(phase);
      float detail = 1.0 - smoothstep(0.5, 2.0, fwidth(phase));
      float row = floor(phase / 6.2832 + 0.25);
      float along = noise(vec2(p.x * 0.18 + row * 3.7, row * 1.3));
      // The crest itself, then foam trailing down its back.
      float crest = smoothstep(0.55, 0.92, wave) * smoothstep(0.3, 0.6, along);
      float foam = smoothstep(-0.2, 0.6, wave) * smoothstep(0.55, 0.8, noise(p * vec2(1.4, 2.6)));
      col += vec3(0.04, 0.12, 0.2) * smoothstep(0.0, 0.9, wave) * detail;
      col = mix(col, vec3(0.86, 0.9, 1.0), (crest * 0.95 + foam * 0.25 * along) * detail);

      // Moon road: the moon's reflection, glinting on the swell.
      vec3 refl = vec3(dir.x, -dir.y, dir.z);
      float road = pow(max(dot(refl, uMoonDir), 0.0), 900.0);
      float glint = noise(vec2(p.x * 1.2, p.y * 3.0 + uTime * 0.8));
      glint = mix(0.6, smoothstep(0.45, 0.75, glint), detail);
      col += vec3(1.0, 0.88, 0.65) * road * glint * 1.3;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Sea(props: { position: [number, number, number]; size: [number, number] }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uMoonDir: { value: new Vector3(1.0, 0.45, -4.6).normalize() },
        },
      }),
    []
  );

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
  });

  return (
    <mesh position={props.position} material={material}>
      <planeGeometry args={props.size} />
    </mesh>
  );
}
