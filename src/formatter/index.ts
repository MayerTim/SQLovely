export {
  formatSqlDocument,
  type FormatSqlDocumentOptions,
  type FormatSqlDocumentResult,
} from './formatSqlDocument';
export { formatSql, formatSqlRangeText, type FormatSqlResult } from './formatSql';
export {
  DEFAULT_FORMAT_SQL_OPTIONS,
  normalizeIndentSize,
  normalizeKeywordCase,
  normalizeInsertSpaces,
  normalizeMaxConsecutiveBlankLines,
  type FormatSqlOptions,
  type KeywordCase,
} from './options';
export {
  DEFAULT_FORMATTING_SAFETY_LIMITS,
  analyzeFormattingSafety,
  resolveFormattingSafetyLimits,
  shouldRunExpensiveLineFormatting,
  type FormattingSafetyDecision,
  type FormattingSafetyLimits,
  type FormattingWorkload,
} from './performanceGuards';
