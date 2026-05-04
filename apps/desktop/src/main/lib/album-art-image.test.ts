import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  downscaleAndHash,
  ALBUM_ART_MAX_DIMENSION,
  ALBUM_ART_HASH_LENGTH,
} from './album-art-image';

/** Build a synthetic PNG of the given size for fixture-free tests. */
async function makePng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe('downscaleAndHash', () => {
  it('returns null for null/undefined/empty input', async () => {
    expect(await downscaleAndHash(null)).toBeNull();
    expect(await downscaleAndHash(undefined)).toBeNull();
    expect(await downscaleAndHash(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for undecodeable bytes', async () => {
    const garbage = Buffer.from('this-is-not-an-image-payload-at-all');
    expect(await downscaleAndHash(garbage)).toBeNull();
  });

  it('decodes a small PNG and re-encodes as JPEG', async () => {
    const png = await makePng(64, 64, { r: 200, g: 100, b: 50 });
    const result = await downscaleAndHash(png);
    expect(result).not.toBeNull();
    expect(result!.ext).toBe('.jpg');
    expect(result!.fileName).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(result!.hash).toHaveLength(ALBUM_ART_HASH_LENGTH);

    // Confirm the output really is JPEG (FF D8 FF magic bytes).
    expect(result!.bytes[0]).toBe(0xff);
    expect(result!.bytes[1]).toBe(0xd8);
    expect(result!.bytes[2]).toBe(0xff);
  });

  it('clamps the longer edge to ALBUM_ART_MAX_DIMENSION', async () => {
    const png = await makePng(2000, 1000, { r: 10, g: 20, b: 30 });
    const result = await downscaleAndHash(png);
    expect(result).not.toBeNull();

    const meta = await sharp(result!.bytes).metadata();
    expect(meta.width).toBe(ALBUM_ART_MAX_DIMENSION);
    expect(meta.height).toBe(Math.round((1000 * ALBUM_ART_MAX_DIMENSION) / 2000));
  });

  it('does not upscale images smaller than ALBUM_ART_MAX_DIMENSION', async () => {
    const png = await makePng(100, 80, { r: 0, g: 128, b: 255 });
    const result = await downscaleAndHash(png);
    expect(result).not.toBeNull();

    const meta = await sharp(result!.bytes).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(80);
  });

  it('produces a deterministic hash for identical input', async () => {
    const png = await makePng(50, 50, { r: 42, g: 42, b: 42 });
    const a = await downscaleAndHash(png);
    const b = await downscaleAndHash(png);
    expect(a!.hash).toBe(b!.hash);
    expect(a!.bytes.equals(b!.bytes)).toBe(true);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await downscaleAndHash(await makePng(100, 100, { r: 0, g: 0, b: 0 }));
    const b = await downscaleAndHash(await makePng(100, 100, { r: 255, g: 255, b: 255 }));
    expect(a!.hash).not.toBe(b!.hash);
  });

  it('accepts Uint8Array input', async () => {
    const png = await makePng(32, 32, { r: 1, g: 2, b: 3 });
    const view = new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
    const result = await downscaleAndHash(view);
    expect(result).not.toBeNull();
    expect(result!.fileName).toMatch(/^[0-9a-f]{32}\.jpg$/);
  });
});
