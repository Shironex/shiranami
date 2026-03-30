import { describe, it, expect } from 'vitest';
import { mimeToExt, extToMime, toArtUrl } from './art-protocol';

describe('mimeToExt', () => {
  it('maps image/jpeg to .jpg', () => {
    expect(mimeToExt('image/jpeg')).toBe('.jpg');
  });

  it('maps image/png to .png', () => {
    expect(mimeToExt('image/png')).toBe('.png');
  });

  it('maps image/webp to .webp', () => {
    expect(mimeToExt('image/webp')).toBe('.webp');
  });

  it('maps image/gif to .gif', () => {
    expect(mimeToExt('image/gif')).toBe('.gif');
  });

  it('maps image/bmp to .bmp', () => {
    expect(mimeToExt('image/bmp')).toBe('.bmp');
  });

  it('falls back to .jpg for unknown MIME types', () => {
    expect(mimeToExt('image/tiff')).toBe('.jpg');
    expect(mimeToExt('application/octet-stream')).toBe('.jpg');
  });
});

describe('extToMime', () => {
  it('maps .jpg to image/jpeg', () => {
    expect(extToMime('.jpg')).toBe('image/jpeg');
  });

  it('maps .jpeg to image/jpeg', () => {
    expect(extToMime('.jpeg')).toBe('image/jpeg');
  });

  it('maps .png to image/png', () => {
    expect(extToMime('.png')).toBe('image/png');
  });

  it('maps .webp to image/webp', () => {
    expect(extToMime('.webp')).toBe('image/webp');
  });

  it('maps .gif to image/gif', () => {
    expect(extToMime('.gif')).toBe('image/gif');
  });

  it('maps .bmp to image/bmp', () => {
    expect(extToMime('.bmp')).toBe('image/bmp');
  });

  it('falls back to image/jpeg for unknown extensions', () => {
    expect(extToMime('.tiff')).toBe('image/jpeg');
    expect(extToMime('.svg')).toBe('image/jpeg');
  });
});

describe('toArtUrl', () => {
  it('returns correct protocol URL', () => {
    expect(toArtUrl('abc123.jpg')).toBe('shiranami-art://art/abc123.jpg');
  });

  it('preserves filename with extension', () => {
    expect(toArtUrl('deadbeef.png')).toBe('shiranami-art://art/deadbeef.png');
  });
});
