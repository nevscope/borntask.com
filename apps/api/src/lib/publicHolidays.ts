import { holidayCountryOptions, ymdSchema, type HolidayCountry } from '@borntask/shared';

const BASE = (process.env.HOLIDAYS_API_URL ?? 'https://date.nager.at/api/v3').replace(/\/$/, '');
const CACHE_MS = 24 * 60 * 60 * 1000;

type NagerCountry = { countryCode?: string; name?: string };
type NagerHoliday = { date?: string; name?: string; types?: string[] };

let countryCache: { at: number; rows: HolidayCountry[] } | null = null;

async function nager<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`holidays_api_${res.status}`);
  return (await res.json()) as T;
}

export async function listHolidayCountries(): Promise<HolidayCountry[]> {
  if (countryCache && Date.now() - countryCache.at < CACHE_MS) return countryCache.rows;
  try {
    const raw = await nager<NagerCountry[]>('/AvailableCountries');
    const rows = raw
      .map((row) => ({
        code: String(row.countryCode ?? '').toUpperCase(),
        name: String(row.name ?? '').trim(),
      }))
      .filter((row) => row.code.length === 2 && row.name);
    countryCache = { at: Date.now(), rows: holidayCountryOptions(rows) };
    return countryCache.rows;
  } catch {
    return holidayCountryOptions();
  }
}

export async function listPublicHolidays(year: number, countryCode: string): Promise<{ date: string; name: string }[]> {
  const raw = await nager<NagerHoliday[]>(`/PublicHolidays/${year}/${countryCode}`);
  const seen = new Set<string>();
  const rows: { date: string; name: string }[] = [];
  for (const row of raw) {
    const date = ymdSchema.safeParse(row.date);
    const name = String(row.name ?? '').trim();
    const types = Array.isArray(row.types) ? row.types.map(String) : [];
    if (!date.success || !name) continue;
    if (types.length && !types.includes('Public')) continue;
    if (seen.has(date.data)) continue;
    seen.add(date.data);
    rows.push({ date: date.data, name: name.slice(0, 80) });
  }
  return rows;
}
