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
import { createInitialIfExpressionFormattingState, expandWatcomIfExpressionLine } from './ifExpressionFormatting';
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
  let ifExpressionFormattingState = createInitialIfExpressionFormattingState();
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
              const canRunIfExpressionFormatting = canRunExceptionFormatting && shouldRunExpensiveLineFormatting(exceptionExpandedLine, safety);
              const ifExpressionResult = canRunIfExpressionFormatting
                ? expandWatcomIfExpressionLine(
                  exceptionExpandedLine,
                  dialect,
                  ifExpressionFormattingState
                )
                : { lines: [exceptionExpandedLine], nextState: ifExpressionFormattingState };
              ifExpressionFormattingState = ifExpressionResult.nextState;

              for (const ifExpressionExpandedLine of ifExpressionResult.lines) {
              const canRunCaseExpressionFormatting = canRunIfExpressionFormatting && shouldRunExpensiveLineFormatting(ifExpressionExpandedLine, safety);
              const caseExpressionResult = canRunCaseExpressionFormatting
                ? expandWatcomCaseExpressionLine(
                  ifExpressionExpandedLine,
                  dialect,
                  caseExpressionFormattingState
                )
                : { lines: [ifExpressionExpandedLine], nextState: caseExpressionFormattingState };
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
                  const leadingBlockIndentDecrease = getLeadingBlockIndentDecrease(lineWords, {
                    isCaseEndLine,
                    isCaseElseLine
                  });
                  const leadingBlockEndCount = getLeadingBlockEndCount(lineWords, isCaseEndLine);
                  const totalBlockEndCount = getTotalBlockEndCount(lineWords, isCaseEndLine);

                  if (isBatchSeparator) {
                    indentLevel = 0;
                    parenthesisIndentLevel = 0;
                    caseExpressionIndentLevel = 0;
                    exceptionIndentContexts.length = 0;
                  } else if (isExceptionWhenLine) {
                    indentLevel = closePreviousExceptionHandlerBody(indentLevel, activeExceptionContext);
                  } else if (closesExceptionSection && activeExceptionContext) {
                    indentLevel = activeExceptionContext.baseIndentLevel;
                  } else if (leadingBlockIndentDecrease > 0) {
                    indentLevel = Math.max(0, indentLevel - leadingBlockIndentDecrease);
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

                  const nonLeadingBlockEndCount = Math.max(0, totalBlockEndCount - leadingBlockEndCount);
                  const blockIndentDeltaAfterLine = (isCaseThenLine ? 0 : getIndentIncreaseAfterLine(lineWords)) - nonLeadingBlockEndCount;
                  indentLevel = Math.max(0, indentLevel + blockIndentDeltaAfterLine);

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

  increase += countStandaloneWord(words, 'begin', (index) => words[index - 1] !== 'end');
  increase += countIfThenOpeners(words);

  if (firstWord === 'then') {
    increase += 1;
  }

  if (firstWord === 'when' && containsWord(words, 'then')) {
    increase += 1;
  }

  increase += countWhileLoopOpeners(words);
  increase += countForLoopOpeners(words);

  if (firstWord === 'do') {
    increase += 1;
  }

  return increase;
}

interface LeadingBlockIndentContext {
  readonly isCaseEndLine: boolean;
  readonly isCaseElseLine: boolean;
}

function getLeadingBlockIndentDecrease(words: readonly string[], context: LeadingBlockIndentContext): number {
  if (words.length === 0) {
    return 0;
  }

  const firstWord = words[0];

  if ((firstWord === 'else' || firstWord === 'elseif') && !context.isCaseElseLine) {
    return 1;
  }

  if (firstWord === 'do' || firstWord === 'exception') {
    return 1;
  }

  return getLeadingBlockEndCount(words, context.isCaseEndLine);
}

function getLeadingBlockEndCount(words: readonly string[], isCaseEndLine: boolean): number {
  let count = 0;
  let index = 0;

  while (index < words.length) {
    const length = getBlockEndPhraseLength(words, index, isCaseEndLine && index === 0);

    if (length === 0) {
      break;
    }

    count += 1;
    index += length;
  }

  return count;
}

function getTotalBlockEndCount(words: readonly string[], isCaseEndLine: boolean): number {
  let count = 0;
  let index = 0;

  while (index < words.length) {
    const length = getBlockEndPhraseLength(words, index, isCaseEndLine && index === 0);

    if (length > 0) {
      count += 1;
      index += length;
      continue;
    }

    index += 1;
  }

  return count;
}

function getBlockEndPhraseLength(words: readonly string[], index: number, isCaseEndAtIndex: boolean): number {
  const word = words[index];

  if (word === 'endif') {
    return 1;
  }

  if (word !== 'end' || isCaseEndAtIndex) {
    return 0;
  }

  return isBlockEndPhrase(words.slice(index)) ? 2 : 1;
}

function countIfThenOpeners(words: readonly string[]): number {
  let count = 0;

  for (let index = 0; index < words.length; index += 1) {
    if (words[index] !== 'if' || words[index - 1] === 'end') {
      continue;
    }

    if (hasFollowingWordBeforeBlockEnd(words, index + 1, 'then')) {
      count += 1;
    }
  }

  return count;
}

function countWhileLoopOpeners(words: readonly string[]): number {
  let count = 0;

  for (let index = 0; index < words.length; index += 1) {
    if (words[index] === 'while' && words[index - 1] !== 'end' && hasFollowingWordBeforeBlockEnd(words, index + 1, 'loop')) {
      count += 1;
    }
  }

  return count;
}

function countForLoopOpeners(words: readonly string[]): number {
  let count = 0;

  for (let index = 0; index < words.length; index += 1) {
    if (words[index] !== 'for' || words[index - 1] === 'end') {
      continue;
    }

    if (hasFollowingWordBeforeBlockEnd(words, index + 1, 'do') || containsCursorForPhrase(words.slice(index))) {
      count += 1;
    }
  }

  return count;
}

function hasFollowingWordBeforeBlockEnd(words: readonly string[], startIndex: number, expected: string): boolean {
  for (let index = startIndex; index < words.length; index += 1) {
    if (words[index] === expected) {
      return true;
    }

    if (getBlockEndPhraseLength(words, index, false) > 0) {
      return false;
    }
  }

  return false;
}

function countStandaloneWord(
  words: readonly string[],
  expected: string,
  shouldCount: (index: number) => boolean
): number {
  return words.filter((word, index) => word === expected && shouldCount(index)).length;
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
function containsWord(words: readonly string[], expected: string): boolean {
  return words.includes(expected);
}

export function cloneFormatterLineScanStateForTesting(): ReturnType<typeof cloneSqlLineScanState> {
  return cloneSqlLineScanState(createInitialSqlLineScanState());
}
