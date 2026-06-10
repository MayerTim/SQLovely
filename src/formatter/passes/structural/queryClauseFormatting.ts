import type { SqlDialect } from '../../../dialects';
import {
  cloneSqlLineScanState,
  createSqlOutsideLookup,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment,
} from '../../sqlLineScanner';

export interface QueryClauseFormattingState {
  readonly scanState: SqlLineScanState;
  readonly parenthesisDepth: number;
}

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: QueryClauseFormattingState;
}

interface WordMatch {
  readonly start: number;
  readonly end: number;
  readonly normalized: string;
  readonly depth: number;
}

const SQL_WORD_START = /[A-Za-z_]/u;
const SQL_WORD_PART = /[A-Za-z0-9_$#]/u;
const JOIN_PREFIXES = new Set(['cross', 'full', 'inner', 'left', 'right']);
const LOGICAL_CLAUSE_STARTERS = new Set(['where', 'on', 'having', 'and', 'or']);

export function createInitialQueryClauseFormattingState(): QueryClauseFormattingState {
  return {
    scanState: { inBlockComment: false },
    parenthesisDepth: 0,
  };
}

/**
 * Splits compact Watcom query clauses into stable physical lines.
 *
 * The pass is intentionally lexical and only rewrites keywords outside strings, quoted identifiers
 * and comments. It also tracks parenthesis depth so subqueries and expressions inside parentheses are
 * not treated as top-level SELECT/FROM/WHERE/JOIN/ON boundaries.
 */
export function expandWatcomQueryClauseLine(
  line: string,
  dialect: SqlDialect,
  initialState: QueryClauseFormattingState,
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState.scanState);
  const outside = createSqlOutsideLookup(line.length, scanResult.outsideSegments);
  const nextState: QueryClauseFormattingState = {
    scanState: scanResult.nextState,
    parenthesisDepth: updateParenthesisDepth(line, outside, initialState.parenthesisDepth),
  };

  if (dialect.id !== 'watcom' || scanResult.nextState.inBlockComment) {
    return { lines: [line], nextState };
  }

  const words = collectWords(line, scanResult.outsideSegments, initialState.parenthesisDepth);

  if (words.length === 0) {
    return { lines: [line], nextState };
  }

  const clauseSplitPoints = findClauseSplitPoints(line, words);
  const clauseLines = splitLineAtIndexes(line, clauseSplitPoints);
  const expandedLines = clauseLines.flatMap((clauseLine) => splitLogicalContinuations(clauseLine));

  if (expandedLines.length === 1 && expandedLines[0] === line) {
    return { lines: [line], nextState };
  }

  return {
    lines: expandedLines.length > 0 ? expandedLines : [line],
    nextState,
  };
}

function findClauseSplitPoints(line: string, words: readonly WordMatch[]): number[] {
  const firstContentIndex = line.search(/\S/u);
  const splitPoints: number[] = [];
  const hasTopLevelQueryWord = words.some(
    (word, index) => word.depth === 0 && isQueryWord(words, index),
  );

  if (!hasTopLevelQueryWord) {
    return splitPoints;
  }

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (word.depth !== 0 || word.start === firstContentIndex) {
      continue;
    }

    if (word.normalized === 'from' || word.normalized === 'where' || word.normalized === 'having') {
      splitPoints.push(word.start);
      continue;
    }

    if (isPhrase(words, index, 'group', 'by') || isPhrase(words, index, 'order', 'by')) {
      splitPoints.push(word.start);
      continue;
    }

    if (isJoinPhraseStart(words, index)) {
      splitPoints.push(word.start);
      continue;
    }

    if (word.normalized === 'on' && hasTopLevelJoinBefore(words, index)) {
      splitPoints.push(word.start);
    }
  }

  return splitPoints;
}

function isQueryWord(words: readonly WordMatch[], index: number): boolean {
  const word = words[index];

  if (
    word.normalized === 'select' ||
    word.normalized === 'from' ||
    word.normalized === 'where' ||
    word.normalized === 'having'
  ) {
    return true;
  }

  return (
    isPhrase(words, index, 'group', 'by') ||
    isPhrase(words, index, 'order', 'by') ||
    isJoinPhraseStart(words, index)
  );
}

function splitLogicalContinuations(line: string): string[] {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(
    line,
    cloneSqlLineScanState({ inBlockComment: false }),
  );
  const words = collectWords(line, scanResult.outsideSegments, 0);
  const firstWord = words[0];

  if (!firstWord || firstWord.depth !== 0 || !LOGICAL_CLAUSE_STARTERS.has(firstWord.normalized)) {
    return [line];
  }

  const splitPoints: number[] = [];
  let betweenPending = false;

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];

    if (word.depth !== 0) {
      continue;
    }

    if (word.normalized === 'and' || word.normalized === 'or') {
      if (word.normalized === 'and' && betweenPending) {
        betweenPending = false;
      } else {
        splitPoints.push(word.start);
      }
    } else if (word.normalized === 'between') {
      betweenPending = true;
    }
  }

  return splitLineAtIndexes(line, splitPoints);
}

function splitLineAtIndexes(line: string, indexes: readonly number[]): string[] {
  const splitIndexes = [...new Set(indexes)]
    .filter((index) => index > 0 && index < line.length)
    .sort((left, right) => left - right);

  if (splitIndexes.length === 0) {
    return [line];
  }

  const lines: string[] = [];
  let segmentStart = 0;

  for (const splitIndex of splitIndexes) {
    pushTrimmed(lines, line.slice(segmentStart, splitIndex));
    segmentStart = splitIndex;
  }

  pushTrimmed(lines, line.slice(segmentStart));

  return lines.length > 0 ? lines : [line];
}

function collectWords(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
  initialDepth: number,
): WordMatch[] {
  const words: WordMatch[] = [];
  let depth = initialDepth;

  for (const segment of outsideSegments) {
    let index = segment.start;

    while (index < segment.end) {
      const char = line[index];

      if (char === '(') {
        depth += 1;
        index += 1;
        continue;
      }

      if (char === ')') {
        depth = Math.max(0, depth - 1);
        index += 1;
        continue;
      }

      if (!SQL_WORD_START.test(char)) {
        index += 1;
        continue;
      }

      const start = index;
      index += 1;

      while (index < segment.end && SQL_WORD_PART.test(line[index])) {
        index += 1;
      }

      words.push({
        start,
        end: index,
        normalized: line.slice(start, index).toLowerCase(),
        depth,
      });
    }
  }

  return words;
}

function updateParenthesisDepth(
  line: string,
  outside: readonly boolean[],
  initialDepth: number,
): number {
  let depth = initialDepth;

  for (let index = 0; index < line.length; index += 1) {
    if (!outside[index]) {
      continue;
    }

    if (line[index] === '(') {
      depth += 1;
    } else if (line[index] === ')') {
      depth = Math.max(0, depth - 1);
    }
  }

  return depth;
}

function isPhrase(
  words: readonly WordMatch[],
  index: number,
  first: string,
  second: string,
): boolean {
  const word = words[index];
  const nextWord = words[index + 1];

  return (
    word?.normalized === first && nextWord?.normalized === second && word.depth === nextWord.depth
  );
}

function isJoinPhraseStart(words: readonly WordMatch[], index: number): boolean {
  const word = words[index];
  const nextWord = words[index + 1];
  const thirdWord = words[index + 2];

  if (word.normalized === 'join') {
    return !isJoinPhraseContinuation(words, index);
  }

  if (!JOIN_PREFIXES.has(word.normalized)) {
    return false;
  }

  if (nextWord?.normalized === 'join' && word.depth === nextWord.depth) {
    return true;
  }

  return (
    nextWord?.normalized === 'outer' &&
    thirdWord?.normalized === 'join' &&
    word.depth === nextWord.depth &&
    word.depth === thirdWord.depth
  );
}

function isJoinPhraseContinuation(words: readonly WordMatch[], index: number): boolean {
  const previousWord = words[index - 1];
  const secondPreviousWord = words[index - 2];

  if (!previousWord || previousWord.depth !== words[index].depth) {
    return false;
  }

  if (JOIN_PREFIXES.has(previousWord.normalized)) {
    return true;
  }

  return (
    previousWord.normalized === 'outer' &&
    secondPreviousWord !== undefined &&
    secondPreviousWord.depth === words[index].depth &&
    JOIN_PREFIXES.has(secondPreviousWord.normalized)
  );
}

function hasTopLevelJoinBefore(words: readonly WordMatch[], index: number): boolean {
  for (let wordIndex = 0; wordIndex < index; wordIndex += 1) {
    if (words[wordIndex].depth === 0 && isJoinPhraseStart(words, wordIndex)) {
      return true;
    }
  }

  return false;
}

function pushTrimmed(lines: string[], value: string): void {
  const trimmed = value.trim();

  if (trimmed.length > 0) {
    lines.push(trimmed);
  }
}
