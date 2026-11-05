/** One-off helpers: find Asana-hosted asset URLs and type-duplicate labels. */

const ASSET_URL = /https?:\/\/(?:www\.)?app\.asana\.com\/(?:app\/asana\/-\/)?get_asset\?[^"'<\s>]*/gi;

export type FoundAsanaAsset = {
  url: string;
  assetId: string;
};

export function decodeHtmlAmp(value: string): string {
  return value.replace(/&amp;/gi, '&');
}

function assetIdFromUrl(url: string): string | null {
  const decoded = decodeHtmlAmp(url);
  const match = /(?:^|[?&])asset_id=(\d+)/i.exec(decoded);
  return match?.[1] ?? null;
}

export function findAsanaAssetLinks(text: string): FoundAsanaAsset[] {
  if (!text) return [];
  const found: FoundAsanaAsset[] = [];
  const seen = new Set<string>();
  ASSET_URL.lastIndex = 0;
  for (const match of text.matchAll(ASSET_URL)) {
    const url = match[0];
    const assetId = assetIdFromUrl(url);
    if (!assetId) continue;
    const key = `${assetId}\0${decodeHtmlAmp(url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ url, assetId });
  }
  return found;
}

export function uniqueAsanaAssetIds(text: string): string[] {
  return [...new Set(findAsanaAssetLinks(text).map((item) => item.assetId))];
}

export function attachmentNameForAsset(assetId: string, originalName?: string): string {
  const prefix = `asana-${assetId}`;
  const raw = (originalName ?? '').split(/[/\\]/).pop()?.trim() ?? '';
  if (!raw || raw === '.' || raw === '..') return `${prefix}.bin`;
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  if (safe.toLowerCase().startsWith(prefix.toLowerCase())) return safe;
  return `${prefix}-${safe}`;
}

export function existingAttachmentForAsset<T extends { name: string }>(
  attachments: T[],
  assetId: string,
): T | undefined {
  const prefix = `asana-${assetId}`.toLowerCase();
  return attachments.find((row) => {
    const name = row.name.toLowerCase();
    return name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`);
  });
}

export function rewriteAsanaAssetLinks(text: string, replacements: Map<string, string>): string {
  if (!text || replacements.size === 0) return text;
  return text.replace(ASSET_URL, (url) => {
    const id = assetIdFromUrl(url);
    if (!id) return url;
    return replacements.get(id) ?? url;
  });
}

export function labelsRepeatingType<T extends { name: string }>(
  typeName: string,
  labels: T[],
): T[] {
  const type = typeName.trim().toLowerCase();
  if (!type) return [];
  return labels.filter((label) => label.name.trim().toLowerCase() === type);
}

export function taskAttachmentHref(taskKey: string, attachmentId: string): string {
  return `/tasks/${encodeURIComponent(taskKey)}/attachments/${encodeURIComponent(attachmentId)}`;
}
