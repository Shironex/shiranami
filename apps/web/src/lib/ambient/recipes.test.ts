import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/showcase/determinism';
import { peakOf, rmsOf } from './dsp';
import { LAYER_SEEDS, PROCEDURAL_RENDERERS, type ProceduralLayerId } from './recipes';

// A low rate keeps the render fast; every filter clamps its corner below Nyquist.
const SR = 8000;
const LAYERS = Object.keys(PROCEDURAL_RENDERERS) as ProceduralLayerId[];

function render(id: ProceduralLayerId) {
  return PROCEDURAL_RENDERERS[id](SR, seededRandom(LAYER_SEEDS[id]));
}

const rendered = Object.fromEntries(LAYERS.map(id => [id, render(id)])) as Record<
  ProceduralLayerId,
  ReturnType<typeof render>
>;

describe.each(LAYERS)('%s', id => {
  const layer = rendered[id];

  it('renders the same bed every time', () => {
    expect(render(id).bed).toEqual(layer.bed);
  });

  it('stays inside the 15 s-per-layer memory rule', () => {
    expect(layer.bed.length / SR).toBeLessThanOrEqual(15);
    expect(layer.bed.length / SR).toBeGreaterThanOrEqual(8);
  });

  it('sits well under the music with headroom to spare', () => {
    const rmsDb = 20 * Math.log10(rmsOf(layer.bed));
    expect(rmsDb).toBeGreaterThan(-33);
    expect(rmsDb).toBeLessThan(-22);
    expect(peakOf(layer.bed)).toBeLessThan(0.5);
  });

  it('is finite everywhere (no filter blew up)', () => {
    expect(layer.bed.every(Number.isFinite)).toBe(true);
    for (const v of layer.grains?.variants ?? []) expect(v.every(Number.isFinite)).toBe(true);
  });
});

describe('grains', () => {
  it('scatters live events for the eventful layers only', () => {
    expect(rendered.rain.grains?.variants.length).toBeGreaterThan(0);
    expect(rendered.vinyl.grains?.variants.length).toBeGreaterThan(0);
    expect(rendered.fire.grains?.variants.length).toBeGreaterThan(0);
    expect(rendered.noise.grains).toBeNull();
  });

  it('keeps every one-shot short and peak-normalised', () => {
    for (const id of ['rain', 'vinyl', 'fire'] as const) {
      const grains = rendered[id].grains;
      for (const v of grains?.variants ?? []) {
        expect(v.length / SR).toBeLessThan(0.2);
        expect(peakOf(v)).toBeCloseTo(1, 5);
      }
      expect(grains?.gain[0]).toBeLessThan(grains?.gain[1] ?? 0);
    }
  });
});

describe('vinyl', () => {
  it('loops on exactly five revolutions at 33⅓ rpm', () => {
    expect(rendered.vinyl.bed.length).toBe(Math.round(5 * 1.8 * SR));
  });
});
