import type { SqlDialect } from '../../../dialects';
import {
  collectSqlWordsFromSegments,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlWordMatch,
} from '../../sqlLineScanner';

export interface CaseExpressionFormattingState {
  readonly scanState: SqlLineScanState;
  readonly caseDepth: number;
}

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: CaseExpressionFormattingState;
}

type WordMatch = SqlWordMatch;

const CASE_SPLIT_WORDS = new Set(['when', 'then', 'else']);
const BLOCK_END_FOLLOWERS = new Set(['for', 'if', 'loop', 'try', 'catch', 'while']);

export function createInitialCaseExpressionFormattingState(): CaseExpressionFormattingState {
  return {
    scanState: { inBlockComment: false },
    caseDepth: 0,
  };
}

/**
 * Splits compact Watcom CASE expressions into stable physical lines.
 *
 * This pass is expression-aware and deliberately conservative: it only rewrites tokens outside
 * strings, quoted identifiers and comments, and it only treats END as a CASE terminator while a
 * CASE expression is open. Procedural END IF/END FOR style block terminators are left untouched.
 */
export function expandWatcomCaseExpressionLine(
  line: string,
  dialect: SqlDialect,
  initialState: CaseExpressionFormattingState,
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState.scanState);
  const words = collectSqlWordsFromSegments(line, scanResult.outsideSegments);
  const nextState: CaseExpressionFormattingState = {
    scanState: scanResult.nextState,
    caseDepth: calculateNextCaseDepth(words, initialState.caseDepth),
  };

  if (dialect.id !== 'watcom' || scanResult.nextState.inBlockComment || words.length === 0) {
    return { lines: [line], nextState };
  }

  const splitPoints = findCaseExpressionSplitPoints(words, initialState.caseDepth);
  const lines = splitLineAtIndexes(line, splitPoints);

  if (lines.length === 1 && lines[0] === line) {
    return { lines: [line], nextState };
  }

  return { lines: lines.length > 0 ? lines : [line], nextState };
}

function findCaseExpressionSplitPoints(
  words: readonly WordMatch[],
  initialCaseDepth: number,
): number[] {
  const splitPoints: number[] = [];
  let caseDepth = initialCaseDepth;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (isCaseStart(words, index)) {
      if (hasLaterCaseMarker(words, index) && word.end < words[words.length - 1].end) {
        splitPoints.push(word.end);
      }

      caseDepth += 1;
      continue;
    }

    if (caseDepth <= 0) {
      continue;
    }

    if (CASE_SPLIT_WORDS.has(word.normalized)) {
      splitPoints.push(word.start);
      continue;
    }

    if (isCaseEnd(words, index, caseDepth)) {
      splitPoints.push(word.start);
      caseDepth = Math.max(0, caseDepth - 1);
    }
  }

  return splitPoints;
}

function calculateNextCaseDepth(words: readonly WordMatch[], initialCaseDepth: number): number {
  let caseDepth = initialCaseDepth;

  for (let index = 0; index < words.length; index += 1) {
    if (isCaseStart(words, index)) {
      caseDepth += 1;
      continue;
    }

    if (isCaseEnd(words, index, caseDepth)) {
      caseDepth = Math.max(0, caseDepth - 1);
    }
  }

  return caseDepth;
}

function isCaseStart(words: readonly WordMatch[], index: number): boolean {
  const word = words[index];
  const nextWord = words[index + 1];

  if (word.normalized !== 'case') {
    return false;
  }

  return nextWord?.normalized !== 'insensitive' && nextWord?.normalized !== 'sensitive';
}

function isCaseEnd(words: readonly WordMatch[], index: number, caseDepth: number): boolean {
  const word = words[index];

  if (caseDepth <= 0 || word.normalized !== 'end') {
    return false;
  }

  return !BLOCK_END_FOLLOWERS.has(words[index + 1]?.normalized ?? '');
}

function hasLaterCaseMarker(words: readonly WordMatch[], startIndex: number): boolean {
  for (let index = startIndex + 1; index < words.length; index += 1) {
    const word = words[index];

    if (CASE_SPLIT_WORDS.has(word.normalized) || word.normalized === 'end') {
      return true;
    }
  }

  return false;
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

function pushTrimmed(lines: string[], text: string): void {
  const trimmed = text.trim();

  if (trimmed.length > 0) {
    lines.push(trimmed);
  }
}
