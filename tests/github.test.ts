import { describe, expect, test } from 'vitest';
import {
  atOrPast,
  extractTaskKeys,
  githubBadgeFromLinks,
  isForwardGithubMove,
  suggestedBranchName,
} from '../packages/shared/src/github.ts';

const delivery = [
  { slug: 'idea', position: 0 },
  { slug: 'approved', position: 1 },
  { slug: 'wip', position: 2 },
  { slug: 'ready_for_testing', position: 3 },
  { slug: 'testing', position: 4 },
  { slug: 'deployed', position: 5 },
];

describe('GitHub task keys', () => {
  test('parses PROJECTKEY-123 in branches, titles and commits', () => {
    expect(extractTaskKeys('bug/WEB-142-checkout', 'Fix WEB-142 and MOB-9', 'also CLI-12')).toEqual([
      'WEB-142',
      'MOB-9',
      'CLI-12',
    ]);
  });
});

describe('GitHub forward moves', () => {
  test('allows Idea to WIP and refuses Testing and backward', () => {
    expect(isForwardGithubMove('idea', 'wip', delivery)).toBe(true);
    expect(isForwardGithubMove('wip', 'ready_for_testing', delivery)).toBe(true);
    expect(isForwardGithubMove('ready_for_testing', 'testing', delivery)).toBe(false);
    expect(isForwardGithubMove('testing', 'deployed', delivery)).toBe(false);
    expect(isForwardGithubMove('wip', 'approved', delivery)).toBe(false);
  });

  test('merged rule skips when already at or past Ready for testing', () => {
    expect(atOrPast('testing', 'ready_for_testing', delivery)).toBe(true);
    expect(atOrPast('approved', 'ready_for_testing', delivery)).toBe(false);
  });
});

describe('badges and branch names', () => {
  test('prefers failed checks then running then merged then branch', () => {
    expect(
      githubBadgeFromLinks([{ kind: 'pr', prState: 'open', checks: 'failed' }, { kind: 'branch', prState: null, checks: null }]),
    ).toBe('pr_failed');
    expect(githubBadgeFromLinks([{ kind: 'pr', prState: 'merged', checks: 'passed' }])).toBe('merged');
    expect(githubBadgeFromLinks([{ kind: 'branch', prState: null, checks: null }])).toBe('branch');
  });

  test('suggested branch follows the mock template', () => {
    expect(suggestedBranchName('{type}/{key}-{title}', 'bug', 'WEB-142', 'Checkout fails on Safari 17')).toBe(
      'bug/WEB-142-checkout-fails-on-safari-17',
    );
  });
});
