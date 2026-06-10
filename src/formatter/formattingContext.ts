import type { SqlDialect } from '../dialects';
import { DEFAULT_FORMAT_SQL_OPTIONS, type FormatSqlOptions } from './options';
import {
  analyzeFormattingSafety,
  createFormattingSafetySummary,
  resolveFormattingSafetyLimits,
  type FormattingSafetyDecision
} from './performanceGuards';

export interface FormattingContext {
  readonly dialect: SqlDialect;
  readonly options: FormatSqlOptions;
  readonly safety: FormattingSafetyDecision;
  readonly safetySummary?: string;
  readonly indentString: string;
}

export interface CreateFormattingContextOptions {
  readonly text: string;
  readonly lines: readonly string[];
  readonly dialect: SqlDialect;
  readonly options?: Partial<FormatSqlOptions>;
}

export function createFormattingContext(input: CreateFormattingContextOptions): FormattingContext {
  const options = resolveFormatSqlOptions(input.options);
  const safety = analyzeFormattingSafety(input.text, input.lines, options.safetyLimits);

  return {
    dialect: input.dialect,
    options,
    safety,
    safetySummary: createFormattingSafetySummary(safety),
    indentString: createIndentString(options.indentSize, options.insertSpaces)
  };
}

export function resolveFormatSqlOptions(options: Partial<FormatSqlOptions> = {}): FormatSqlOptions {
  return {
    ...DEFAULT_FORMAT_SQL_OPTIONS,
    ...options,
    safetyLimits: resolveFormattingSafetyLimits(options.safetyLimits)
  };
}

export function isFormattingCancellationRequested(context: FormattingContext): boolean {
  return context.options.isCancellationRequested?.() === true;
}

function createIndentString(indentSize: number, insertSpaces: boolean): string {
  if (!insertSpaces) {
    return '	';
  }

  return ' '.repeat(Math.max(1, indentSize));
}
