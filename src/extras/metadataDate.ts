export function normalizeMetadataDateValue(value: string): string {
  return parseMetadataDate(value.trim())?.isoDate ?? value.trim();
}

export function normalizeMetadataDateLiterals(value: string): string {
  return value
    .replace(/\b(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\b/gu, (match, year, month, day) => {
      return formatParsedMetadataDate(year, month, day) ?? match;
    })
    .replace(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/gu, (match, day, month, year) => {
      return formatParsedMetadataDate(year, month, day) ?? match;
    })
    .replace(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})\b/gu, (match, day, month, year) => {
      return formatParsedMetadataDate(year, month, day) ?? match;
    });
}

interface ParsedMetadataDate {
  readonly isoDate: string;
}

function parseMetadataDate(value: string): ParsedMetadataDate | undefined {
  const isoMatch = /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/u.exec(value);

  if (isoMatch) {
    return createParsedMetadataDate(isoMatch[1] ?? '', isoMatch[2] ?? '', isoMatch[3] ?? '');
  }

  const dayFirstMatch = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/u.exec(value);

  if (dayFirstMatch) {
    return createParsedMetadataDate(dayFirstMatch[3] ?? '', dayFirstMatch[2] ?? '', dayFirstMatch[1] ?? '');
  }

  const dayFirstShortYearMatch = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})$/u.exec(value);

  if (dayFirstShortYearMatch) {
    return createParsedMetadataDate(
      dayFirstShortYearMatch[3] ?? '',
      dayFirstShortYearMatch[2] ?? '',
      dayFirstShortYearMatch[1] ?? ''
    );
  }

  return undefined;
}

function createParsedMetadataDate(yearText: string, monthText: string, dayText: string): ParsedMetadataDate | undefined {
  const isoDate = formatParsedMetadataDate(yearText, monthText, dayText);
  return isoDate ? { isoDate } : undefined;
}

function formatParsedMetadataDate(yearText: string, monthText: string, dayText: string): string | undefined {
  const year = resolveMetadataYear(yearText);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!isValidMetadataDate(year, month, day)) {
    return undefined;
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function resolveMetadataYear(yearText: string): number {
  const year = Number.parseInt(yearText, 10);

  if (yearText.length !== 2) {
    return year;
  }

  return year <= 49 ? 2000 + year : 1900 + year;
}

function isValidMetadataDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}
