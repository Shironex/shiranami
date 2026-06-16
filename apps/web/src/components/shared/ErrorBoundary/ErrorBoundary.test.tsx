import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import ErrorBoundary from './ErrorBoundary';
import { toast } from 'sonner';

function Thrower({ shouldThrow, message = 'boom' }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) throw new Error(message);
  return <div>child-content</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence expected React error-boundary logging from error throws during render
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary viewName="Test">
        <div>hello-child</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('hello-child')).toBeInTheDocument();
  });

  it('renders fallback with title and error message when child throws', () => {
    render(
      <ErrorBoundary viewName="Test">
        <Thrower shouldThrow message="something exploded" />
      </ErrorBoundary>
    );

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('something exploded')).toBeInTheDocument();
  });

  it('reload view button resets and re-renders children after child stops throwing', async () => {
    const user = userEvent.setup();

    function TestTree() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <>
          <button data-testid="stop" onClick={() => setShouldThrow(false)}>
            stop
          </button>
          <ErrorBoundary viewName="Test">
            <Thrower shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </>
      );
    }

    render(<TestTree />);

    // Fallback is visible
    expect(screen.getByText('title')).toBeInTheDocument();

    // Flip parent state so children stop throwing
    await user.click(screen.getByTestId('stop'));

    // Click the reloadView button to reset the boundary
    await user.click(screen.getByRole('button', { name: /reloadView/ }));

    expect(screen.getByText('child-content')).toBeInTheDocument();
    expect(screen.queryByText('title')).not.toBeInTheDocument();
  });

  it('report button copies error details and fires success toast', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <ErrorBoundary viewName="MyView">
        <Thrower shouldThrow message="kaboom" />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: /report$/ }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0][0] as string;
    expect(payload).toContain('MyView');
    expect(payload).toContain('kaboom');
    expect(toast.success).toHaveBeenCalledWith('reportCopied');
  });

  it('renders rootTitle and rootMessage in root variant', () => {
    render(
      <ErrorBoundary root viewName="Root">
        <Thrower shouldThrow message="fatal" />
      </ErrorBoundary>
    );

    expect(screen.getByText('rootTitle')).toBeInTheDocument();
    expect(screen.getByText('rootMessage')).toBeInTheDocument();
    expect(screen.queryByText('title')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reloadApp/ })).toBeInTheDocument();
  });
});
