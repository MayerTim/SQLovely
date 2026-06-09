import type { SqlDialect } from '../dialects';
import { collectSqlWordsOutsideLiteralsAndComments, applyKeywordCaseToLine } from './keywordCase';
import { DEFAULT_FORMAT_SQL_OPTIONS, type FormatSqlOptions } from './options';
import { expandWatcomInlineIfLine } from './inlineIfFormatting';
import { expandUnionAllLine } from './unionAllFormatting';
import {
  analyzeParenthesesForIndent,
  createInitialParenthesisFormattingState,
  expandParenthesesInLine
} from './parenthesisFormatting';
import { createInitialSqlLineScanState, cloneSqlLineScanState } from './sqlLineScanner';

export interface FormatSqlResult {
  readonly text: string;
  readonly changed: boolean;
}

interface SplitTextResult {
  readonly eol: string;
  readonly lines: readonly string[];
  readonly hadFinalNewline: boolean;
}

const DECREASE_BEFORE_LINE = new Set(['end', 'endif', 'else', 'elseif']);

export function formatSql(
  text: string,
  dialect: SqlDialect,
  options: Partial<FormatSqlOptions> = {}
): FormatSqlResult {
  const resolvedOptions: FormatSqlOptions = { ...DEFAULT_FORMAT_SQL_OPTIONS, ...options };
  const split = splitSqlText(text);
  const formattedLines: string[] = [];
  const indentString = createIndentString(resolvedOptions.indentSize, resolvedOptions.insertSpaces);
  let indentLevel = 0;
  let blankLineCount = 0;
  let keywordScanState = createInitialSqlLineScanState();
  let wordScanState = createInitialSqlLineScanState();
  let inlineIfScanState = createInitialSqlLineScanState();
  let unionAllScanState = createInitialSqlLineScanState();
  let parenthesisExpansionState = createInitialParenthesisFormattingState();
  let parenthesisIndentLevel = 0;
  let parenthesisIndentScanState = createInitialSqlLineScanState();

  for (const sourceLine of split.lines) {
    const expandedLineResult = expandWatcomInlineIfLine(sourceLine, dialect, inlineIfScanState);
    inlineIfScanState = expandedLineResult.nextState;

    for (const inlineExpandedLine of expandedLineResult.lines) {
      const unionAllResult = expandUnionAllLine(inlineExpandedLine, unionAllScanState);
      unionAllScanState = unionAllResult.nextState;

      for (const unionExpandedLine of unionAllResult.lines) {
        const parenthesisResult = dialect.id === 'watcom'
          ? expandParenthesesInLine(unionExpandedLine, parenthesisExpansionState)
          : { lines: [unionExpandedLine], nextState: parenthesisExpansionState };
        parenthesisExpansionState = parenthesisResult.nextState;

        for (const originalLine of parenthesisResult.lines) {
          const withoutTrailingWhitespace = originalLine.replace(/[ \t]+$/u, '');
          const trimmedLine = withoutTrailingWhitespace.trim();

          const keywordResult = applyKeywordCaseToLine(
            withoutTrailingWhitespace,
            dialect,
            resolvedOptions.keywordCase,
            keywordScanState
          );
          keywordScanState = keywordResult.nextState;

          const wordResult = collectSqlWordsOutsideLiteralsAndComments(trimmedLine, wordScanState);
          wordScanState = wordResult.nextState;

          if (trimmedLine.length === 0) {
            if (blankLineCount < resolvedOptions.maxConsecutiveBlankLines) {
              formattedLines.push('');
            }

            blankLineCount += 1;
            continue;
          }

          blankLineCount = 0;

          const lineWords = [...wordResult.words];
          const firstWord = lineWords[0];
          const isBatchSeparator = isBatchSeparatorLine(lineWords, dialect);
          const shouldTemporarilyReincrease = firstWord === 'else' || firstWord === 'elseif';
          const continuationIndentLevel = isLogicalContinuationLine(trimmedLine, lineWords) ? 1 : 0;
          const parenthesisIndentAnalysis = analyzeParenthesesForIndent(trimmedLine, parenthesisIndentScanState);
          const effectiveParenthesisIndentLevel = Math.max(
            0,
            parenthesisIndentLevel - parenthesisIndentAnalysis.leadingClosingParentheses
          );

          if (isBatchSeparator) {
            indentLevel = 0;
            parenthesisIndentLevel = 0;
          } else if (firstWord && DECREASE_BEFORE_LINE.has(firstWord)) {
            indentLevel = Math.max(0, indentLevel - 1);
          }

          const formattedContent = keywordResult.line.trim();
          formattedLines.push(
            `${indentString.repeat(indentLevel + effectiveParenthesisIndentLevel + continuationIndentLevel)}${formattedContent}`
          );

          parenthesisIndentLevel = Math.max(0, parenthesisIndentLevel + parenthesisIndentAnalysis.depthDelta);
          parenthesisIndentScanState = parenthesisIndentAnalysis.nextScanState;

          if (isBatchSeparator) {
            indentLevel = 0;
            parenthesisIndentLevel = 0;
            continue;
          }

          indentLevel = Math.max(0, indentLevel + getIndentIncreaseAfterLine(lineWords));

          if (shouldTemporarilyReincrease) {
            indentLevel += 1;
          }
        }
      }
    }
  }

  let nextText = formattedLines.join(split.eol);

  if (resolvedOptions.ensureFinalNewline || split.hadFinalNewline) {
    nextText += split.eol;
  }

  return {
    text: nextText,
    changed: nextText !== text
  };
}

export function formatSqlRangeText(
  text: string,
  dialect: SqlDialect,
  options: Partial<FormatSqlOptions> = {}
): FormatSqlResult {
  return formatSql(text, dialect, { ...options, ensureFinalNewline: false });
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

function createIndentString(indentSize: number, insertSpaces: boolean): string {
  if (!insertSpaces) {
    return '\t';
  }

  return ' '.repeat(Math.max(1, indentSize));
}

function isBatchSeparatorLine(words: readonly string[], dialect: SqlDialect): boolean {
  if (words.length === 0 || !dialect.batchSeparators.has(words[0])) {
    return false;
  }

  return words.length === 1 || /^\d+$/u.test(words[1]);
}

function getIndentIncreaseAfterLine(words: readonly string[]): number {
  if (words.length === 0) {
    return 0;
  }

  const firstWord = words[0];
  let increase = 0;

  if (containsWord(words, 'begin') && firstWord !== 'end') {
    increase += countWord(words, 'begin');
  }

  if (firstWord === 'if' && containsWord(words, 'then') && !containsEndIfPhrase(words)) {
    increase += 1;
  }

  if (firstWord === 'then') {
    increase += 1;
  }

  if (firstWord === 'case' && !containsWord(words, 'end')) {
    increase += 1;
  }

  if (firstWord === 'while' && containsWord(words, 'loop') && !containsWord(words, 'end')) {
    increase += 1;
  }

  return increase;
}

function isLogicalContinuationLine(line: string, words: readonly string[]): boolean {
  const firstWord = words[0];
  return (firstWord === 'and' || firstWord === 'or') && line.trim().length > firstWord.length;
}

function containsEndIfPhrase(words: readonly string[]): boolean {
  if (containsWord(words, 'endif')) {
    return true;
  }

  return words.some((word, index) => word === 'end' && words[index + 1] === 'if');
}

function containsWord(words: readonly string[], expected: string): boolean {
  return words.includes(expected);
}

function countWord(words: readonly string[], expected: string): number {
  return words.filter((word) => word === expected).length;
}

export function cloneFormatterLineScanStateForTesting(): ReturnType<typeof cloneSqlLineScanState> {
  return cloneSqlLineScanState(createInitialSqlLineScanState());
}
