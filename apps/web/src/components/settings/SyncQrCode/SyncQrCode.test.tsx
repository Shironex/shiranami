import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SyncQrCode from './SyncQrCode';
import { buildQrPath } from './SyncQrCode.hooks';

const LINK =
  'shiranami://pair?v=1&h=192.168.1.20&p=53111&id=desk-1&n=Studio+PC&t=nonce-0001&k=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

describe('SyncQrCode', () => {
  it('renders a labelled image and never exposes the payload as text', () => {
    render(<SyncQrCode value={LINK} label="Pairing code" />);

    const image = screen.getByRole('img', { name: 'Pairing code' });
    expect(image.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(image.textContent).not.toContain('AAECAw');
  });

  it('includes a four module quiet zone on every side', () => {
    const { modules, path } = buildQrPath(LINK);
    const coords = [...path.matchAll(/M(\d+) (\d+)/g)].map(([, x, y]) => [Number(x), Number(y)]);

    expect(Math.min(...coords.flat())).toBe(4);
    expect(Math.max(...coords.flat())).toBe(modules - 5);
  });

  it('re-encodes when the link changes', () => {
    expect(buildQrPath(LINK).path).not.toBe(buildQrPath(`${LINK}x`).path);
  });
});
