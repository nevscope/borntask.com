import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampToViewport } from '../apps/web/src/lib/clampToViewport';

function box(left: number, width: number) {
  return {
    style: { transform: '' },
    getBoundingClientRect: () => ({
      left,
      right: left + width,
      top: 0,
      bottom: 40,
      width,
      height: 40,
      x: left,
      y: 0,
      toJSON() { return {}; },
    }),
  } as HTMLElement;
}

describe('clampToViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shifts left when the popover crosses the right edge', () => {
    vi.stubGlobal('window', { innerWidth: 1240 });
    const el = box(1100, 220);
    clampToViewport(el, 16);
    expect(el.style.transform).toBe('translateX(-96px)');
  });

  it('does not shift when the popover already fits', () => {
    vi.stubGlobal('window', { innerWidth: 1600 });
    const el = box(200, 220);
    clampToViewport(el, 16);
    expect(el.style.transform).toBe('');
  });
});
