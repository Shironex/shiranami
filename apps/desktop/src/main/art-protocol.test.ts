import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ---------------------------------------------------------------------------
// downscaleImage — takes a NativeImage; each test builds a stub directly.
// ---------------------------------------------------------------------------

function makeImageStub({
  width = 1000,
  height = 1000,
  jpegOutput = Buffer.from('jpeg-output'),
}: {
  width?: number;
  height?: number;
  jpegOutput?: Buffer;
} = {}) {
  const resizedStub = {
    toJPEG: vi.fn().mockReturnValue(jpegOutput),
  };
  const stub = {
    isEmpty: vi.fn().mockReturnValue(false),
    getSize: vi.fn().mockReturnValue({ width, height }),
    resize: vi.fn().mockReturnValue(resizedStub),
    toJPEG: vi.fn().mockReturnValue(jpegOutput),
  };
  return { stub, resizedStub };
}

describe('downscaleImage', () => {
  it('re-encodes to JPEG q=85 without resize when dimensions are within limit', async () => {
    const jpeg = Buffer.from('small-jpeg');
    const { stub } = makeImageStub({ width: 256, height: 256, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).not.toHaveBeenCalled();
    expect(stub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('resizes wide image so longest edge becomes 512', async () => {
    const jpeg = Buffer.from('resized-wide');
    const { stub, resizedStub } = makeImageStub({ width: 1024, height: 512, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 512, height: 256, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('resizes tall image so longest edge becomes 512', async () => {
    const jpeg = Buffer.from('resized-tall');
    const { stub, resizedStub } = makeImageStub({ width: 400, height: 800, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 256, height: 512, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('resizes square image so both edges become 512', async () => {
    const jpeg = Buffer.from('resized-square');
    const { stub, resizedStub } = makeImageStub({ width: 1000, height: 1000, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 512, height: 512, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('floors target dimension at 1px for extreme aspect ratios', async () => {
    const jpeg = Buffer.from('resized-extreme');
    const { stub, resizedStub } = makeImageStub({ width: 10000, height: 1, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 512, height: 1, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });
});

// ---------------------------------------------------------------------------
// saveAlbumArt — mocks nativeImage via vi.mock (module-level).
// ---------------------------------------------------------------------------

vi.mock('electron', async importOriginal => {
  const original = await importOriginal<typeof import('electron')>();
  return {
    ...original,
    nativeImage: {
      createFromBuffer: vi.fn(),
    },
  };
});

describe('saveAlbumArt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null for empty buffer', async () => {
    const { saveAlbumArt } = await import('./art-protocol');
    expect(await saveAlbumArt(Buffer.alloc(0), 'image/jpeg')).toBeNull();
  });

  it('returns null when nativeImage cannot decode the buffer', async () => {
    const { nativeImage } = await import('electron');
    const emptyStub = { isEmpty: vi.fn().mockReturnValue(true) };
    vi.mocked(nativeImage.createFromBuffer).mockReturnValue(emptyStub as never);

    const { saveAlbumArt } = await import('./art-protocol');
    expect(await saveAlbumArt(Buffer.from('garbage'), 'image/jpeg')).toBeNull();
  });
});
