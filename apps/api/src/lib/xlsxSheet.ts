// Minimal xlsx reader for Asana exports. No extra dependency: unzip local headers and read sheet XML.
import { inflateRawSync } from 'node:zlib';
import type { ParsedSheet } from '@borntask/shared';

export function parseXlsx(buf: Buffer): ParsedSheet {
  const files = unzip(buf);
  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml') ?? '');
  const sheetName = [...files.keys()].find((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (!sheetName) return { headers: [], rows: [] };
  const xml = files.get(sheetName);
  if (!xml) return { headers: [], rows: [] };
  return sheetToTable(xml, shared);
}

export function sheetToCsv(parsed: ParsedSheet): string {
  const headers = parsed.headers;
  const lines = [headers.map(csvCell).join(',')];
  for (const row of parsed.rows) {
    lines.push(headers.map((header) => csvCell(row[header] ?? '')).join(','));
  }
  return lines.join('\n');
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.toString('utf8', nameStart, nameStart + nameLen);
    let dataStart = nameStart + nameLen + extraLen;
    let size = compSize;
    if ((flags & 0x8) !== 0 && compSize === 0) {
      const found = findDescriptor(buf, dataStart);
      size = found.size;
      dataStart = found.dataStart;
    }
    const compressed = buf.subarray(dataStart, dataStart + size);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
    if (data && !name.endsWith('/')) out.set(name.replace(/\\/g, '/'), data.toString('utf8'));
    offset = dataStart + size;
    if ((flags & 0x8) !== 0 && compSize === 0) offset += 16;
  }
  return out;
}

function findDescriptor(buf: Buffer, from: number): { dataStart: number; size: number } {
  const marker = Buffer.from([0x50, 0x4b, 0x07, 0x08]);
  const at = buf.indexOf(marker, from);
  if (at < 0) throw new Error('This workbook uses a zip layout BornTask cannot read. Save it as CSV.');
  return { dataStart: from, size: at - from };
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const items = xml.match(/<si\b[\s\S]*?<\/si>/g) ?? [];
  for (const item of items) {
    const texts = [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ''));
    out.push(texts.join(''));
  }
  return out;
}

function sheetToTable(xml: string, shared: string[]): ParsedSheet {
  const rows: string[][] = [];
  const rowXml = xml.match(/<row\b[\s\S]*?<\/row>/g) ?? [];
  for (const row of rowXml) {
    const cells = [...row.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)];
    const line: string[] = [];
    for (const cell of cells) {
      const attrs = cell[1] ?? '';
      const body = cell[2] ?? '';
      const ref = /r="([A-Z]+)\d+"/i.exec(attrs)?.[1] ?? '';
      const col = columnIndex(ref);
      const kind = /t="([^"]+)"/.exec(attrs)?.[1] ?? '';
      let value = '';
      if (kind === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? '')).join('');
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        if (kind === 's') value = shared[Number(raw)] ?? '';
        else if (kind === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else value = decodeXml(raw);
      }
      while (line.length < col) line.push('');
      line[col] = value;
    }
    rows.push(line);
  }
  const headerRow = rows[0] ?? [];
  const width = Math.max(headerRow.length, ...rows.map((row) => row.length));
  const headers = Array.from({ length: width }, (_, index) => headerRow[index]?.trim() || `Column ${index + 1}`);
  const seen = new Map<string, number>();
  const unique = headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header} ${count + 1}`;
  });
  const records = rows.slice(1).filter((row) => row.some((cell) => cell.trim() !== '')).map((row) => {
    const record: Record<string, string> = {};
    unique.forEach((header, index) => {
      record[header] = excelDate(header, row[index] ?? '');
    });
    return record;
  });
  return { headers: unique, rows: records };
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function excelDate(header: string, value: string): string {
  if (!/date/i.test(header)) return value;
  if (!/^\d+(\.\d+)?$/.test(value)) return value;
  const serial = Number(value);
  if (serial < 20000 || serial > 80000) return value;
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return utc.toISOString().slice(0, 10);
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
