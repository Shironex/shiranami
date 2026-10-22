import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { ShaderMaterial, Vector3 } from 'three';

// The night view behind the window, after C0. It is a flat card just outside
// the glass, but each pixel traces the view ray: rays below the horizon hit
// the sea (swell rows, white crests, the moon road), rays above it see the
// sky (clouds, a few stars, the moon and its halo), and rocks stand on the
// horizon at the sides. So perspective comes out right from every camera stop.

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
  float fbm(vec2 p) {
    return 0.55 * noise(p) + 0.3 * noise(p * 2.1 + 3.7) + 0.15 * noise(p * 4.3 + 9.1);
  }
  float bump(float x, float c, float w) { return exp(-(x - c) * (x - c) / (w * w)); }

  // Rocks at a fixed distance, as a skyline over azimuth: a headland on the
  // right and a low rock in the water on the left. Each has a top and a
  // waterline (its foot drops below the horizon by its distance).
  // x: top elevation (radians), y: waterline elevation. x < y: no rock.
  vec2 rocks(float az) {
    float rough = (noise(vec2(az * 45.0, 2.0)) - 0.5) * 0.006;
    // Heights above each rock's waterline, so the flanks slope into the sea.
    float head = smoothstep(0.30, 0.38, az) * 0.05 + bump(az, 0.40, 0.03) * 0.03 + bump(az, 0.345, 0.015) * 0.012;
    head = max(head, smoothstep(0.42, 0.62, az) * 0.095) + rough * smoothstep(0.3, 0.34, az);
    if (az > 0.28) return vec2(-0.035 + head, -0.035);
    float low = bump(az, 0.13, 0.025) * 0.022 + rough * 0.4 * bump(az, 0.13, 0.03);
    if (az > 0.06 && az < 0.2) return vec2(-0.075 + low, -0.075);
    return vec2(-1.0, 0.0);
  }

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    // Azimuth from straight out of the window (-z) and elevation: the view
    // through the window at infinity, so every camera stop agrees on it.
    float az = atan(dir.x, -dir.z);
    float el = dir.y;
    float moonAz = atan(uMoonDir.x, -uMoonDir.z);
    float moonDot = dot(dir, uMoonDir);
    vec3 horizon = vec3(0.17, 0.18, 0.42);
    vec3 col;

    vec2 rock = rocks(az);
    float top = rock.x;
    // The waterline is broken up a little, so the rocks sit in the swell.
    float waterline = rock.y + (noise(vec2(az * 70.0, uTime * 0.5)) - 0.5) * 0.006;
    if (el < top && el > waterline) {
      // Rock: near black violet, a cool moonlit rim along the top edge.
      float rim = smoothstep(top - 0.006, top, el) * (0.5 + 0.5 * noise(vec2(az * 90.0, el * 90.0)));
      col = vec3(0.035, 0.03, 0.085) + vec3(0.12, 0.12, 0.26) * rim;
      col += vec3(0.02, 0.02, 0.05) * noise(vec2(az * 30.0, el * 40.0));
    } else if (el > 0.0) {
      // Sky: deep indigo, lighter at the horizon.
      col = mix(horizon, vec3(0.04, 0.05, 0.17), pow(min(el * 3.0, 1.0), 0.6));
      vec2 sp = vec2(az, el);
      // A few stars, kept off the moon and dimmed toward the horizon haze.
      vec2 cell = floor(sp * 140.0);
      float star = step(0.985, hash(cell)) * smoothstep(0.05, 0.2, el) * smoothstep(0.995, 0.97, moonDot);
      star *= 0.5 + 0.5 * sin(uTime * 1.3 + hash(cell + 7.0) * 30.0);
      col += vec3(0.75, 0.78, 1.0) * star * smoothstep(0.35, 0.0, length(fract(sp * 140.0) - 0.5));
      // Soft clouds in a band above the horizon, their edges lit by the moon.
      float c = fbm(vec2(az * 7.0 + uTime * 0.004, el * 26.0));
      float band = smoothstep(0.02, 0.08, el) * smoothstep(0.3, 0.12, el);
      float cloud = smoothstep(0.56, 0.74, c) * band;
      float lit = smoothstep(0.75, 0.99, moonDot);
      col = mix(col, vec3(0.08, 0.08, 0.22) + vec3(0.28, 0.26, 0.42) * lit * smoothstep(0.55, 0.75, c), cloud * 0.85);
      // The moon, a soft halo around it, and a wide glow.
      float ang = acos(clamp(moonDot, -1.0, 1.0));
      col += vec3(0.32, 0.31, 0.5) * exp(-ang * 26.0) * 0.7;
      col += vec3(0.12, 0.12, 0.26) * exp(-ang * 6.0) * 0.5;
      float disc = smoothstep(0.0215, 0.0195, ang);
      vec3 moon = vec3(1.0, 0.95, 0.82) * (0.92 + 0.08 * noise(dir.xy * 400.0));
      col = mix(col, moon, disc);
    } else {
      // Sea. The distance to the water grows as 1/angle below the horizon,
      // eased off for steep views so the rows never get huge.
      float s = -el;
      float dist = s < 0.12 ? 1.2 / max(s, 1e-4) : 10.0 * pow(0.12 / s, 0.5);
      float near = exp(-dist * 0.035);
      col = mix(horizon * 0.72, vec3(0.025, 0.055, 0.16), near);

      // Swell rows rolling toward the shore, each a white crest with a teal
      // face behind it, broken up along its length. Rows are spaced by the log
      // of the distance (painterly, as in C0), so they stay visible far out
      // instead of melting into a flat band; they fade before going sub-pixel.
      float ld = log(dist);
      float phase = ld * 26.0 + uTime * 0.9 + noise(vec2(az * 6.0, ld * 2.0)) * 2.5;
      // Steep views (the crossfade stop looks down through the glass) would
      // blow single rows up into blobs, so the detail fades out there too.
      float detail = (1.0 - smoothstep(0.9, 2.6, fwidth(phase))) * smoothstep(0.32, 0.16, s);
      float w = fract(phase / 6.2832);
      float row = floor(phase / 6.2832);
      float along = smoothstep(0.38, 0.66, noise(vec2(az * 38.0 + row * 5.1, row * 1.7)));
      float crest = bump(w, 0.08, 0.05 + 0.03 * near) * along;
      float face = smoothstep(0.12, 0.22, w) * smoothstep(0.65, 0.22, w);
      float foam = smoothstep(0.55, 0.8, noise(vec2(az * 90.0, phase * 0.9))) * smoothstep(0.45, 0.12, w) * along;
      float strength = mix(0.4, 1.0, near);
      col += vec3(0.03, 0.13, 0.19) * face * (0.3 + 0.7 * near) * detail;
      col = mix(col, vec3(0.86, 0.9, 1.0), clamp((crest * 0.9 + foam * 0.35) * strength * detail, 0.0, 1.0));
      // Rows too fine to draw merge into a soft sheen instead of aliasing.
      col += vec3(0.05, 0.06, 0.12) * (1.0 - detail);

      // Moon road: a column of glints under the moon, wider toward the shore.
      float width = 0.01 + s * 0.3;
      float road = bump(az - moonAz, 0.0, width);
      float glint = smoothstep(0.5, 0.8, noise(vec2(az * 110.0, phase * 2.6)));
      glint = mix(0.45, glint, detail);
      col += vec3(1.0, 0.86, 0.62) * road * (0.12 + glint * 0.9) * mix(1.0, 0.6, near);

      // Spray where the swell meets the rocks.
      float wl = rock.x > rock.y ? waterline : 1.0;
      float spray = smoothstep(0.005, 0.0, wl - el) * step(el, wl) * smoothstep(0.55, 0.8, noise(vec2(az * 140.0, uTime * 0.9)));
      col = mix(col, vec3(0.8, 0.85, 1.0), spray * 0.45);
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
