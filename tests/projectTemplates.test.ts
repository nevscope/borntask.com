import { describe, expect, test } from 'vitest';
import {
  formatReleaseSectionName,
  projectTemplates,
  resolveProjectCreatePlan,
  sectionNameLooksLikeStatus,
  SECTION_WHEN_RULE,
} from '../packages/shared/src/projectTemplates.ts';

describe('project templates', () => {
  test('product dev uses delivery and release-shaped sections without status words', () => {
    const plan = resolveProjectCreatePlan({ template: 'product_dev' });
    expect(plan.workflow).toBe('delivery');
    expect(plan.sections[0]).toBe('Inbox');
    expect(plan.sections.at(-1)).toBe('Backlog');
    expect(plan.sections.some((name) => /release/i.test(name))).toBe(true);
    expect(plan.sections.every((name) => !sectionNameLooksLikeStatus(name))).toBe(true);
    expect(plan.defaultViewIds).toContain('preset-open');
  });

  test('launch and ops uses simple workflow and phase sections', () => {
    const plan = resolveProjectCreatePlan({ template: 'launch_ops' });
    expect(plan.workflow).toBe('simple');
    expect(plan.sections).toEqual(['Discovery', 'Launch', 'After launch']);
    expect(plan.sections.every((name) => !sectionNameLooksLikeStatus(name))).toBe(true);
  });

  test('keeps a supplied section list and still copies the template workflow', () => {
    const plan = resolveProjectCreatePlan({
      template: 'product_dev',
      workflow: 'simple',
      sections: ['Inbox', 'May release (12 May 2026)', 'Backlog'],
    });
    expect(plan.workflow).toBe('delivery');
    expect(plan.sections).toEqual(['Inbox', 'May release (12 May 2026)', 'Backlog']);
  });

  test('without a template, empty sections stay Inbox', () => {
    expect(resolveProjectCreatePlan({}).sections).toEqual(['Inbox']);
    expect(resolveProjectCreatePlan({ workflow: 'simple' }).workflow).toBe('simple');
  });

  test('flags status words in section names and leaves when-names alone', () => {
    expect(sectionNameLooksLikeStatus('Approved Tasks')).toBe(true);
    expect(sectionNameLooksLikeStatus('Deployed on test, ready for testing')).toBe(true);
    expect(sectionNameLooksLikeStatus('Current Issues on Live')).toBe(true);
    expect(sectionNameLooksLikeStatus('Inbox')).toBe(false);
    expect(sectionNameLooksLikeStatus('Next release')).toBe(false);
    expect(sectionNameLooksLikeStatus('Launch')).toBe(false);
    expect(sectionNameLooksLikeStatus('After launch')).toBe(false);
  });

  test('formats a release name with a date', () => {
    expect(formatReleaseSectionName('November release', '2026-11-12')).toBe('November release (12 Nov 2026)');
    expect(formatReleaseSectionName('Next release', '')).toBe('Next release');
  });

  test('ships the where / what / when rule and two templates', () => {
    expect(SECTION_WHEN_RULE).toContain('Status says where');
    expect(projectTemplates.map((row) => row.id)).toEqual(['product_dev', 'launch_ops']);
  });
});
