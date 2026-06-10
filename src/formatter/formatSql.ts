import type { SqlDialect } from '../dialects';
import { collectSqlWordsOutsideLiteralsAndComments, applyKeywordCaseToLine } from './keywordCase';
import { DEFAULT_FORMAT_SQL_OPTIONS, type FormatSqlOptions } from './options';
import {
  analyzeFormattingSafety,
  createFormattingSafetySummary,
  resolveFormattingSafetyLimits,
  shouldRunExpensiveLineFormatting,
  type FormattingSafetyDecision
} from './performanceGuards';
import { expandWatcomInlineIfLine } from './inlineIfFormatting';
import { expandUnionAllLine } from './unionAllFormatting';
import { createInitialCursorForFormattingState, expandWatcomCursorForLine } from './cursorForFormatting';
import { createInitialQueryClauseFormattingState, expandWatcomQueryClauseLine } from './queryClauseFormatting';
import { createInitialCaseExpressionFormattingState, expandWatcomCaseExpressionLine } from './caseExpressionFormatting';
import { createInitialExceptionFormattingState, expandWatcomExceptionLine } from './exceptionFormatting';
import { createInitialBlockEndFormattingState, expandWatcomBlockEndLine } from './blockEndFormatting';
import {
  analyzeParenthesesForIndent,
  createInitialParenthesisFormattingState,
  expandParenthesesInLine
} from './parenthesisFormatting';
import { createInitialSqlLineScanState, cloneSqlLineScanState } from './sqlLineScanner';

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

interface ExceptionIndentContext {
  baseIndentLevel: number;
  handlerBodyIndentLevel: number;
}

const DECREASE_BEFORE_LINE = new Set(['end', 'endif', 'else', 'elseif', 'do', 'exception']);

export function formatSql(
  text: string,
  dialect: SqlDialect,
  options: Partial<FormatSqlOptions> = {}
): FormatSqlResult {
  const resolvedOptions: FormatSqlOptions = {
    ...DEFAULT_FORMAT_SQL_OPTIONS,
    ...options,
    safetyLimits: resolveFormattingSafetyLimits(options.safetyLimits)
  };
  const split = splitSqlText(text);
  const safety = analyzeFormattingSafety(text, split.lines, resolvedOptions.safetyLimits);

  if (resolvedOptions.isCancellationRequested?.()) {
    return {
      text,
      changed: false,
      safety,
      safetySummary: createFormattingSafetySummary(safety)
    };
  }
  const formattedLines: string[] = [];
  const indentString = createIndentString(resolvedOptions.indentSize, resolvedOptions.insertSpaces);
  let indentLevel = 0;
  let blankLineCount = 0;
  let keywordScanState = createInitialSqlLineScanState();
  let wordScanState = createInitialSqlLineScanState();
  let inlineIfScanState = createInitialSqlLineScanState();
  let unionAllScanState = createInitialSqlLineScanState();
  let cursorForScanState = createInitialCursorForFormattingState();
  let queryClauseFormattingState = createInitialQueryClauseFormattingState();
  let exceptionFormattingState = createInitialExceptionFormattingState();
  let caseExpressionFormattingState = createInitialCaseExpressionFormattingState();
  let blockEndFormattingState = createInitialBlockEndFormattingState();
  let parenthesisExpansionState = createInitialParenthesisFormattingState();
  let parenthesisIndentLevel = 0;
  let caseExpressionIndentLevel = 0;
  let parenthesisIndentScanState = createInitialSqlLineScanState();
  const exceptionIndentContexts: ExceptionIndentContext[] = [];

  for (const sourceLine of split.lines) {
    if (resolvedOptions.isCancellationRequested?.()) {
      return {
        text,
        changed: false,
        safety,
        safetySummary: createFormattingSafetySummary(safety)
      };
    }

    const canRunSourceLineFormatting = shouldRunExpensiveLineFormatting(sourceLine, safety);
    const expandedLineResult = canRunSourceLineFormatting
      ? expandWatcomInlineIfLine(sourceLine, dialect, inlineIfScanState)
      : { lines: [sourceLine], nextState: inlineIfScanState };
    inlineIfScanState = expandedLineResult.nextState;

    for (const inlineExpandedLine of expandedLineResult.lines) {
      const canRunUnionFormatting = canRunSourceLineFormatting && shouldRunExpensiveLineFormatting(inlineExpandedLine, safety);
      const unionAllResult = canRunUnionFormatting
        ? expandUnionAllLine(inlineExpandedLine, unionAllScanState)
        : { lines: [inlineExpandedLine], nextState: unionAllScanState };
      unionAllScanState = unionAllResult.nextState;

      for (const unionExpandedLine of unionAllResult.lines) {
        const canRunCursorFormatting = canRunUnionFormatting && shouldRunExpensiveLineFormatting(unionExpandedLine, safety);
        const cursorForResult = canRunCursorFormatting
          ? expandWatcomCursorForLine(unionExpandedLine, dialect, cursorForScanState)
          : { lines: [unionExpandedLine], nextState: cursorForScanState };
        cursorForScanState = cursorForResult.nextState;

        for (const cursorForExpandedLine of cursorForResult.lines) {
          const canRunQueryClauseFormatting = canRunCursorFormatting && shouldRunExpensiveLineFormatting(cursorForExpandedLine, safety);
          const queryClauseResult = canRunQueryClauseFormatting
            ? expandWatcomQueryClauseLine(cursorForExpandedLine, dialect, queryClauseFormattingState)
            : { lines: [cursorForExpandedLine], nextState: queryClauseFormattingState };
          queryClauseFormattingState = queryClauseResult.nextState;

          for (const queryClauseExpandedLine of queryClauseResult.lines) {
            const canRunExceptionFormatting = canRunQueryClauseFormatting && shouldRunExpensiveLineFormatting(queryClauseExpandedLine, safety);
            const exceptionResult = canRunExceptionFormatting
              ? expandWatcomExceptionLine(
                queryClauseExpandedLine,
                dialect,
                exceptionFormattingState
              )
              : { lines: [queryClauseExpandedLine], nextState: exceptionFormattingState };
            exceptionFormattingState = exceptionResult.nextState;

            for (const exceptionExpandedLine of exceptionResult.lines) {
              const canRunCaseExpressionFormatting = canRunExceptionFormatting && shouldRunExpensiveLineFormatting(exceptionExpandedLine, safety);
              const caseExpressionResult = canRunCaseExpressionFormatting
                ? expandWatcomCaseExpressionLine(
                  exceptionExpandedLine,
                  dialect,
                  caseExpressionFormattingState
                )
                : { lines: [exceptionExpandedLine], nextState: caseExpressionFormattingState };
              caseExpressionFormattingState = caseExpressionResult.nextState;

              for (const caseExpressionExpandedLine of caseExpressionResult.lines) {
                const canRunBlockEndFormatting = canRunCaseExpressionFormatting && shouldRunExpensiveLineFormatting(caseExpressionExpandedLine, safety);
                const blockEndResult = canRunBlockEndFormatting
                  ? expandWatcomBlockEndLine(
                    caseExpressionExpandedLine,
                    dialect,
                    blockEndFormattingState
                  )
                  : { lines: [caseExpressionExpandedLine], nextState: blockEndFormattingState };
                blockEndFormattingState = blockEndResult.nextState;

                for (const blockEndExpandedLine of blockEndResult.lines) {
                  const canRunParenthesisFormatting = canRunBlockEndFormatting && shouldRunExpensiveLineFormatting(blockEndExpandedLine, safety);
                  const parenthesisResult = dialect.id === 'watcom' && canRunParenthesisFormatting
                    ? expandParenthesesInLine(blockEndExpandedLine, parenthesisExpansionState)
                    : { lines: [blockEndExpandedLine], nextState: parenthesisExpansionState };
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
                  const isCaseEndLine = isCaseExpressionEndLine(lineWords, caseExpressionIndentLevel);
                  const isCaseElseLine = caseExpressionIndentLevel > 0 && firstWord === 'else';
                  const isCaseThenLine = caseExpressionIndentLevel > 0 && firstWord === 'then';
                  const isExceptionLine = firstWord === 'exception';
                  const activeExceptionContext = exceptionIndentContexts[exceptionIndentContexts.length - 1];
                  const isExceptionWhenLine = activeExceptionContext !== undefined && firstWord === 'when' && containsWord(lineWords, 'then');
                  const closesExceptionSection = isFinalExceptionEndLine(lineWords, indentLevel, activeExceptionContext);
                  const shouldTemporarilyReincrease = (firstWord === 'else' || firstWord === 'elseif') && !isCaseElseLine;
                  const continuationIndentLevel = isLogicalContinuationLine(trimmedLine, lineWords) ? 1 : 0;
                  const parenthesisIndentAnalysis = analyzeParenthesesForIndent(trimmedLine, parenthesisIndentScanState);
                  const effectiveParenthesisIndentLevel = Math.max(
                    0,
                    parenthesisIndentLevel - parenthesisIndentAnalysis.leadingClosingParentheses
                  );

                  if (isBatchSeparator) {
                    indentLevel = 0;
                    parenthesisIndentLevel = 0;
                    caseExpressionIndentLevel = 0;
                    exceptionIndentContexts.length = 0;
                  } else if (isExceptionWhenLine) {
                    indentLevel = closePreviousExceptionHandlerBody(indentLevel, activeExceptionContext);
                  } else if (closesExceptionSection && activeExceptionContext) {
                    indentLevel = activeExceptionContext.baseIndentLevel;
                  } else if (firstWord && DECREASE_BEFORE_LINE.has(firstWord) && !isCaseEndLine && !isCaseElseLine) {
                    indentLevel = Math.max(0, indentLevel - 1);
                  }

                  const effectiveCaseExpressionIndentLevel = Math.max(
                    0,
                    caseExpressionIndentLevel - (isCaseEndLine ? 1 : 0)
                  );
                  const formattedContent = keywordResult.line.trim();
                  formattedLines.push(
                    `${indentString.repeat(indentLevel + effectiveParenthesisIndentLevel + effectiveCaseExpressionIndentLevel + continuationIndentLevel)}${formattedContent}`
                  );

                  parenthesisIndentLevel = Math.max(0, parenthesisIndentLevel + parenthesisIndentAnalysis.depthDelta);
                  parenthesisIndentScanState = parenthesisIndentAnalysis.nextScanState;
                  caseExpressionIndentLevel = Math.max(
                    0,
                    effectiveCaseExpressionIndentLevel + getCaseExpressionIndentIncreaseAfterLine(lineWords)
                  );

                  if (isBatchSeparator) {
                    indentLevel = 0;
                    parenthesisIndentLevel = 0;
                    caseExpressionIndentLevel = 0;
                    exceptionIndentContexts.length = 0;
                    continue;
                  }

                  if (closesExceptionSection) {
                    exceptionIndentContexts.pop();
                    continue;
                  }

                  if (isExceptionLine) {
                    exceptionIndentContexts.push({ baseIndentLevel: indentLevel, handlerBodyIndentLevel: 0 });
                    indentLevel += 1;
                    continue;
                  }

                  indentLevel = Math.max(0, indentLevel + (isCaseThenLine ? 0 : getIndentIncreaseAfterLine(lineWords)));

                  if (isExceptionWhenLine && activeExceptionContext) {
                    activeExceptionContext.handlerBodyIndentLevel = 1;
                  }

                  if (shouldTemporarilyReincrease) {
                    indentLevel += 1;
                  }
                }
              }
            }
          }
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
    changed: nextText !== text,
    safety,
    safetySummary: createFormattingSafetySummary(safety)
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

  if (firstWord === 'when' && containsWord(words, 'then')) {
    increase += 1;
  }

  if (firstWord === 'while' && containsWord(words, 'loop') && !containsWord(words, 'end')) {
    increase += 1;
  }

  if (firstWord === 'for' && (containsWord(words, 'do') || containsCursorForPhrase(words))) {
    increase += 1;
  }

  if (firstWord === 'do') {
    increase += 1;
  }

  return increase;
}


function closePreviousExceptionHandlerBody(
  indentLevel: number,
  context: ExceptionIndentContext
): number {
  if (context.handlerBodyIndentLevel <= 0) {
    return indentLevel;
  }

  const handlerIndentLevel = context.baseIndentLevel + 1;
  const closedIndentLevel = Math.max(handlerIndentLevel, indentLevel - context.handlerBodyIndentLevel);
  context.handlerBodyIndentLevel = 0;
  return closedIndentLevel;
}

function isFinalExceptionEndLine(
  words: readonly string[],
  indentLevel: number,
  context: ExceptionIndentContext | undefined
): boolean {
  if (!context || words[0] !== 'end' || isBlockEndPhrase(words)) {
    return false;
  }

  return indentLevel <= context.baseIndentLevel + 1 + context.handlerBodyIndentLevel;
}

function isCaseExpressionEndLine(words: readonly string[], caseExpressionIndentLevel: number): boolean {
  if (caseExpressionIndentLevel <= 0 || words[0] !== 'end') {
    return false;
  }

  return !isBlockEndPhrase(words);
}

function getCaseExpressionIndentIncreaseAfterLine(words: readonly string[]): number {
  if (words.length === 0) {
    return 0;
  }

  return words.filter((word, index) => word === 'case' && !isCaseSensitivityPhrase(words, index)).length;
}

function isCaseSensitivityPhrase(words: readonly string[], index: number): boolean {
  return words[index] === 'case' && (words[index + 1] === 'insensitive' || words[index + 1] === 'sensitive');
}

function isBlockEndPhrase(words: readonly string[]): boolean {
  const nextWord = words[1];

  return nextWord === 'if' ||
    nextWord === 'for' ||
    nextWord === 'loop' ||
    nextWord === 'try' ||
    nextWord === 'catch' ||
    nextWord === 'while';
}

function isLogicalContinuationLine(line: string, words: readonly string[]): boolean {
  const firstWord = words[0];
  if ((firstWord === 'and' || firstWord === 'or') && line.trim().length > firstWord.length) {
    return true;
  }

  return firstWord === 'on' && words[1] !== 'exception' && line.trim().length > firstWord.length;
}

function containsCursorForPhrase(words: readonly string[]): boolean {
  return words.some((word, index) => word === 'cursor' && words[index + 1] === 'for');
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
