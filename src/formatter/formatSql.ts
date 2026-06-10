import type { SqlDialect } from '../dialects';
import type { FormatSqlOptions } from './options';
import type { FormattingSafetyDecision } from './performanceGuards';
import { createFormattingPipeline } from './formattingPipeline';
import { createFormattingContext, isFormattingCancellationRequested, type FormattingContext } from './formattingContext';
import { createInitialSqlLineScanState, cloneSqlLineScanState } from './sqlLineScanner';
import { cleanupWatcomStatementContinuations } from './passes/cleanup/statementContinuationCleanup';
import { cleanupWatcomDdlParentheses } from './passes/cleanup/ddlParenthesisCleanup';
import { formatLinesWithIndentation } from './indentation/indentationEngine';

export interface FormatSqlResult {
  readonly text: string;
  readonly changed: boolean;
  readonly safety: FormattingSafetyDecision;
  readonly safetySummary?: string;
}

interface SplitTextResult {
  readonly eol: string;
  readonly lines: readonly string[];
  readonly hadFinalNewline: boolean;
}

export function formatSql(
  text: string,
  dialect: SqlDialect,
  options: Partial<FormatSqlOptions> = {}
): FormatSqlResult {
  const split = splitSqlText(text);
  const context = createFormattingContext({ text, lines: split.lines, dialect, options });
  const { dialect: activeDialect, options: resolvedOptions, safety, indentString } = context;

  if (isFormattingCancellationRequested(context)) {
    return createUnchangedFormatResult(text, context);
  }

  const formattingPipeline = createFormattingPipeline(context);
  const indentationResult = formatLinesWithIndentation({
    sourceLines: split.lines,
    context,
    pipeline: formattingPipeline
  });

  if (indentationResult.cancelled) {
    return createUnchangedFormatResult(text, context);
  }

  const formattedLines = indentationResult.lines;
  const separatorNormalizedLines = activeDialect.id === 'watcom'
    ? restoreOrderByIfExpressionSeparators(formattedLines)
    : formattedLines;
  const statementCleanedLines = activeDialect.id === 'watcom'
    ? cleanupWatcomStatementContinuations(separatorNormalizedLines, indentString)
    : separatorNormalizedLines;
  const ddlParenthesisCleanedLines = activeDialect.id === 'watcom'
    ? cleanupWatcomDdlParentheses(statementCleanedLines)
    : statementCleanedLines;
  let nextText = ddlParenthesisCleanedLines.join(split.eol);

  if (resolvedOptions.ensureFinalNewline || split.hadFinalNewline) {
    nextText += split.eol;
  }

  return {
    text: nextText,
    changed: nextText !== text,
    safety,
    safetySummary: context.safetySummary
  };
}

export function formatSqlRangeText(
  text: string,
  dialect: SqlDialect,
  options: Partial<FormatSqlOptions> = {}
): FormatSqlResult {
  return formatSql(text, dialect, { ...options, ensureFinalNewline: false });
}

function createUnchangedFormatResult(text: string, context: FormattingContext): FormatSqlResult {
  return {
    text,
    changed: false,
    safety: context.safety,
    safetySummary: context.safetySummary
  };
}

function restoreOrderByIfExpressionSeparators(lines: readonly string[]): string[] {
  const normalizedLines = [...lines];

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const line = normalizedLines[index];
    const trimmed = line.trim();

    if (!isIfExpressionLineMissingSeparator(trimmed) || !isInsideOrderByContinuation(normalizedLines, index)) {
      continue;
    }

    const nextLineIndex = findNextNonBlankLineIndex(normalizedLines, index + 1);

    if (nextLineIndex < 0) {
      continue;
    }

    const nextLine = normalizedLines[nextLineIndex];

    if (countLeadingWhitespace(nextLine) !== countLeadingWhitespace(line)) {
      continue;
    }

    if (!isLikelyOrderByListContinuationLine(nextLine.trim())) {
      continue;
    }

    normalizedLines[index] = `${line},`;
  }

  return normalizedLines;
}

function isIfExpressionLineMissingSeparator(trimmedLine: string): boolean {
  return /^if\b.+\bthen\b.+\belse\b.+\bendif$/iu.test(trimmedLine) && !/[;,]$/u.test(trimmedLine);
}

function isInsideOrderByContinuation(lines: readonly string[], lineIndex: number): boolean {
  const currentIndent = countLeadingWhitespace(lines[lineIndex]);

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previousLine = lines[index];
    const trimmed = previousLine.trim();

    if (trimmed.length === 0) {
      continue;
    }

    if (countLeadingWhitespace(previousLine) >= currentIndent) {
      continue;
    }

    return /^order\s+by\b/iu.test(trimmed);
  }

  return false;
}

function findNextNonBlankLineIndex(lines: readonly string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim().length > 0) {
      return index;
    }
  }

  return -1;
}

function isLikelyOrderByListContinuationLine(trimmedLine: string): boolean {
  if (trimmedLine.length === 0 || /^[),;]/u.test(trimmedLine)) {
    return false;
  }

  return !/^(?:select|into|from|where|group\s+by|having|order\s+by|union|limit|offset|fetch|for\s+update|end|else|elseif|when|then|do|begin|grant|create)\b/iu.test(trimmedLine);
}

function countLeadingWhitespace(line: string): number {
  const match = /^\s*/u.exec(line);
  return match?.[0].length ?? 0;
}

function splitSqlText(text: string): SplitTextResult {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalNewline = /(?:\r\n|\r|\n)$/.test(text);
  const lines = text.split(/\r\n|\r|\n/);

  if (hadFinalNewline) {
    lines.pop();
  }

  return { eol, lines, hadFinalNewline };
}

export function cloneFormatterLineScanStateForTesting(): ReturnType<typeof cloneSqlLineScanState> {
  return cloneSqlLineScanState(createInitialSqlLineScanState());
}
