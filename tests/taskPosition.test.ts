import { describe, expect, it } from 'vitest';
import { nextPosition, positionNumber } from '../apps/api/src/lib/mappers.ts';

describe('sequential create_task positions', () => {
  it('gives each create a unique stored rank and API sort key after the last in the section', () => {
    const ranks: string[] = [];
    let after: string | null = null;
    for (let i = 0; i < 24; i++) {
      after = nextPosition(after);
      ranks.push(after);
    }
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(new Set(ranks.map(positionNumber)).size).toBe(ranks.length);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!.localeCompare(ranks[i - 1]!, 'en')).toBeGreaterThan(0);
      expect(positionNumber(ranks[i]!)).toBeGreaterThan(positionNumber(ranks[i - 1]!));
    }
  });

  it('still allocates a distinct sort key after a long z-suffixed rank', () => {
    const stuck = '3345881012346';
    const first = nextPosition(stuck);
    const second = nextPosition(first);
    const third = nextPosition(second);
    expect(new Set([stuck, first, second, third]).size).toBe(4);
    expect(new Set([stuck, first, second, third].map(positionNumber)).size).toBe(4);
    expect(first.localeCompare(stuck, 'en')).toBeGreaterThan(0);
  });

  it('increments a leftover numeric rank so MCP creates stay unique', () => {
    expect(nextPosition('3345881012346')).toBe('3345881012347');
    expect(nextPosition('3345881012347')).toBe('3345881012348');
  });
});
