export type KeywordCase = 'upper' | 'lower' | 'preserve';

export interface FormatSqlOptions {
  readonly keywordCase: KeywordCase;
  readonly indentSize: number;
  readonly insertSpaces: boolean;
  readonly maxConsecutiveBlankLines: number;
  readonly ensureFinalNewline: boolean;
}

export const DEFAULT_FORMAT_SQL_OPTIONS: FormatSqlOptions = {
  keywordCase: 'upper',
  indentSize: 2,
  insertSpaces: true,
  maxConsecutiveBlankLines: 1,
  ensureFinalNewline: true
};

export function normalizeKeywordCase(value: unknown): KeywordCase {
  if (value === 'upper' || value === 'lower' || value === 'preserve') {
    return value;
  }

  return DEFAULT_FORMAT_SQL_OPTIONS.keywordCase;
}

export function normalizeInsertSpaces(value: unknown): boolean {
  if (value === false) {
    return false;
  }

  if (value === true) {
    return true;
  }

  return DEFAULT_FORMAT_SQL_OPTIONS.insertSpaces;
}

export function normalizeIndentSize(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.min(16, Math.floor(value)));
  }

  return DEFAULT_FORMAT_SQL_OPTIONS.indentSize;
}

export function normalizeMaxConsecutiveBlankLines(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.max(0, Math.min(10, Math.floor(value)));
  }

  return DEFAULT_FORMAT_SQL_OPTIONS.maxConsecutiveBlankLines;
}
