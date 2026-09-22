import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useUIStore } from '@/stores/useUIStore';
import RoomLightPreview from './RoomLightPreview';

const LAYER = '[data-slot="room-light-preview-layer"]';

describe('RoomLightPreview', () => {
  beforeEach(() => {
    // Hold a stop rather than following the clock so assertions are stable at
    // any hour the suite happens to run.
    useUIStore.setState({ roomLightStop: 'night', roomLightIntensity: 100, roomLightHueShift: 0 });
  });

  it('labels the mock with the localized preview caption', () => {
    render(<RoomLightPreview enabled />);

    expect(screen.getByRole('img', { name: 'Room light preview' })).toBeInTheDocument();
  });

  it('mounts the grade layer and names the shown stop when enabled', () => {
    const { container } = render(<RoomLightPreview enabled />);

    const layer = container.querySelector(LAYER);
    expect(layer).not.toBeNull();
    expect(layer?.getAttribute('style')).toContain('--room-light-tint');
    expect(screen.getByText('Night · 100%')).toBeInTheDocument();
  });

  it('unmounts the grade layer entirely when disabled', () => {
    const { container } = render(<RoomLightPreview enabled={false} />);

    expect(container.querySelector(LAYER)).toBeNull();
    expect(screen.getByText('Light off')).toBeInTheDocument();
  });

  it('scales the wash with the intensity setting', () => {
    useUIStore.setState({ roomLightIntensity: 0 });

    const { container } = render(<RoomLightPreview enabled />);

    // Night's warmth is 22%; at zero intensity the mix collapses to nothing.
    expect(container.querySelector(LAYER)?.getAttribute('style')).toContain('0%');
    expect(screen.getByText('Night · 0%')).toBeInTheDocument();
  });
});
