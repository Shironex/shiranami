import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu, MenuDivider, MenuItem, MenuLabel } from './menu';

function renderMenu({
  onRequestClose = vi.fn(),
  onDelete = vi.fn(),
}: { onRequestClose?: () => void; onDelete?: () => void } = {}) {
  render(
    <Menu autoFocus aria-label="Track actions" onRequestClose={onRequestClose}>
      <MenuLabel>2 selected</MenuLabel>
      <MenuItem onClick={vi.fn()}>Alpha</MenuItem>
      <MenuItem onClick={vi.fn()}>Beta</MenuItem>
      <MenuItem disabled onClick={vi.fn()}>
        Gamma
      </MenuItem>
      <MenuDivider />
      <MenuItem variant="destructive" onClick={onDelete}>
        Delete
      </MenuItem>
    </Menu>
  );
}

function item(name: string): HTMLElement {
  return screen.getByRole('menuitem', { name });
}

describe('Menu', () => {
  it('renders menu semantics and takes focus on mount', () => {
    renderMenu();

    const menu = screen.getByRole('menu', { name: 'Track actions' });
    expect(menu).toHaveFocus();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('roves focus with arrow keys, wrapping and skipping disabled items', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.keyboard('{ArrowDown}');
    expect(item('Alpha')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(item('Beta')).toHaveFocus();

    // Gamma is disabled — skipped straight to Delete.
    await user.keyboard('{ArrowDown}');
    expect(item('Delete')).toHaveFocus();

    // Wraps back to the top.
    await user.keyboard('{ArrowDown}');
    expect(item('Alpha')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(item('Delete')).toHaveFocus();
  });

  it('jumps to the first and last enabled item with Home and End', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.keyboard('{End}');
    expect(item('Delete')).toHaveFocus();

    await user.keyboard('{Home}');
    expect(item('Alpha')).toHaveFocus();
  });

  it('moves focus by typeahead on the item label', async () => {
    const user = userEvent.setup();
    renderMenu();

    // Quick successive characters accumulate into one query.
    await user.keyboard('be');
    expect(item('Beta')).toHaveFocus();

    // After the reset pause a new query starts from scratch.
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => new Date().getTime() + 1000);
    await user.keyboard('d');
    expect(item('Delete')).toHaveFocus();
    spy.mockRestore();
  });

  it('activates the focused item with Enter', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderMenu({ onDelete });

    await user.keyboard('{End}');
    await user.keyboard('{Enter}');

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('requests close on Tab instead of tabbing away', async () => {
    const onRequestClose = vi.fn();
    const user = userEvent.setup();
    renderMenu({ onRequestClose });

    await user.tab();

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toHaveFocus();
  });

  it('restores focus to the previously focused element on unmount', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(
      <Menu autoFocus aria-label="Menu">
        <MenuItem onClick={vi.fn()}>Alpha</MenuItem>
      </Menu>
    );
    expect(screen.getByRole('menu')).toHaveFocus();

    unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
