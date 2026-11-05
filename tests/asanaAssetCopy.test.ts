import { describe, expect, test } from 'vitest';
import {
  attachmentNameForAsset,
  existingAttachmentForAsset,
  findAsanaAssetLinks,
  labelsRepeatingType,
  rewriteAsanaAssetLinks,
  taskAttachmentHref,
  uniqueAsanaAssetIds,
} from '../packages/shared/src/asanaAssetCopy.ts';

const SAMPLE = 'https://app.asana.com/app/asana/-/get_asset?asset_id=1234567890123';

describe('Asana asset URLs', () => {
  test('finds get_asset links in descriptions and comments', () => {
    const html = `<p>See <img src="${SAMPLE}"><a href="${SAMPLE}&amp;size=lg">shot</a></p>\nAlso ${SAMPLE}`;
    const found = findAsanaAssetLinks(html);
    expect(found.map((item) => item.assetId)).toEqual(['1234567890123', '1234567890123']);
    expect(uniqueAsanaAssetIds(html)).toEqual(['1234567890123']);
  });

  test('rewrites every matching URL to the BornTask attachment path', () => {
    const next = '/tasks/GEN-23/attachments/att1';
    const html = `<img src="${SAMPLE}"><p>${SAMPLE}</p>`;
    expect(rewriteAsanaAssetLinks(html, new Map([['1234567890123', next]]))).toBe(
      `<img src="${next}"><p>${next}</p>`,
    );
  });

  test('leaves other Asana links alone', () => {
    const text = 'https://app.asana.com/0/120/123/f';
    expect(findAsanaAssetLinks(text)).toEqual([]);
    expect(rewriteAsanaAssetLinks(text, new Map([['123', '/x']]))).toBe(text);
  });

  test('does not treat an existing asana-* file as missing', () => {
    const rows = [{ name: 'asana-99-shot.png' }, { name: 'notes.pdf' }];
    expect(existingAttachmentForAsset(rows, '99')?.name).toBe('asana-99-shot.png');
    expect(existingAttachmentForAsset(rows, '100')).toBeUndefined();
  });

  test('names downloads so a rerun can skip them', () => {
    expect(attachmentNameForAsset('99', 'Screen Shot.png')).toBe('asana-99-Screen_Shot.png');
    expect(attachmentNameForAsset('99')).toBe('asana-99.bin');
  });

  test('builds the same attachment href the editor already allows', () => {
    expect(taskAttachmentHref('GEN-23', 'abc123')).toBe('/tasks/GEN-23/attachments/abc123');
  });
});

describe('type-duplicate labels', () => {
  test('strips a Bug label when the type is already Bug', () => {
    expect(labelsRepeatingType('Bug', [{ name: 'Bug' }, { name: 'Import' }])).toEqual([{ name: 'Bug' }]);
  });

  test('keeps labels that are not the type name', () => {
    expect(labelsRepeatingType('Bug', [{ name: 'frontend' }])).toEqual([]);
  });
});
