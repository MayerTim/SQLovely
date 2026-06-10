import type { SqlDialect } from '../dialects';
import {
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment
} from './sqlLineScanner';

export interface ExceptionFormattingState {
  readonly scanState: SqlLineScanState;
  readonly inExceptionSection: boolean;
}

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: ExceptionFormattingState;
}

interface WordMatch {
  readonly start: number;
  readonly end: number;
  readonly normalized: string;
}

const SQL_WORD_START = /[A-Za-z_]/u;
const SQL_WORD_PART = /[A-Za-z0-9_$#]/u;

export function createInitialExceptionFormattingState(): ExceptionFormattingState {
  return {
    scanState: { inBlockComment: false },
    inExceptionSection: false
  };
}

/**
 * Splits compact Watcom exception handlers into structural lines.
 *
 * Exception sections are block separators, not normal statements. This pass keeps `ON EXCEPTION
 * RESUME` and `DECLARE ... EXCEPTION` untouched, but splits compact handler forms such as
 * `EXCEPTION WHEN OTHERS THEN BEGIN` so the indentation pass can align EXCEPTION, WHEN and handler
 * body lines deterministically.
 */
export function expandWatcomExceptionLine(
  line: string,
  dialect: SqlDialect,
  initialState: ExceptionFormattingState
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState.scanState);
  const words = collectWords(line, scanResult.outsideSegments);
  const nextState: ExceptionFormattingState = {
    scanState: scanResult.nextState,
    inExceptionSection: calculateNextExceptionSectionState(words, initialState.inExceptionSection)
  };

  if (dialect.id !== 'watcom' || scanResult.nextState.inBlockComment || words.length === 0) {
    return { lines: [line], nextState };
  }

  const splitPoints = findExceptionSplitPoints(words, initialState.inExceptionSection);
  const lines = splitLineAtIndexes(line, splitPoints);

  if (lines.length === 1 && lines[0] === line) {
    return { lines: [line], nextState };
  }

  return { lines: lines.length > 0 ? lines : [line], nextState };
}

function findExceptionSplitPoints(words: readonly WordMatch[], inExceptionSection: boolean): number[] {
  const splitPoints: number[] = [];
  let exceptionSectionSeen = inExceptionSection;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (isExceptionSectionStart(words, index)) {
      exceptionSectionSeen = true;

      if (index > 0) {
        splitPoints.push(word.start);
      }

      continue;
    }

    if (!exceptionSectionSeen) {
      continue;
    }

    if (word.normalized === 'when' && index > 0) {
      splitPoints.push(word.start);
      continue;
    }

    if (word.normalized === 'begin' && isImmediatelyAfterThen(words, index)) {
      splitPoints.push(word.start);
    }
  }

  return splitPoints;
}

function calculateNextExceptionSectionState(
  words: readonly WordMatch[],
  initialInExceptionSection: boolean
): boolean {
  let inExceptionSection = initialInExceptionSection;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (isExceptionSectionStart(words, index)) {
      inExceptionSection = true;
      continue;
    }

    if (inExceptionSection && word.normalized === 'end' && !isBlockEndPhrase(words, index)) {
      inExceptionSection = false;
    }
  }

  return inExceptionSection;
}

function isExceptionSectionStart(words: readonly WordMatch[], index: number): boolean {
  const word = words[index];

  if (word.normalized !== 'exception') {
    return false;
  }

  const previousWord = words[index - 1]?.normalized;
  const nextWord = words[index + 1]?.normalized;

  if (previousWord === 'on' || previousWord === 'declare' || nextWord === 'resume') {
    return false;
  }

  return true;
}

function isImmediatelyAfterThen(words: readonly WordMatch[], index: number): boolean {
  return words[index - 1]?.normalized === 'then';
}

function isBlockEndPhrase(words: readonly WordMatch[], index: number): boolean {
  const nextWord = words[index + 1]?.normalized;

  return nextWord === 'if' ||
    nextWord === 'for' ||
    nextWord === 'loop' ||
    nextWord === 'try' ||
    nextWord === 'catch' ||
    nextWord === 'while';
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

function collectWords(line: string, outsideSegments: readonly SqlOutsideSegment[]): WordMatch[] {
  const words: WordMatch[] = [];

  for (const segment of outsideSegments) {
    let index = segment.start;

    while (index < segment.end) {
      if (!SQL_WORD_START.test(line[index])) {
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
        normalized: line.slice(start, index).toLowerCase()
      });
    }
  }

  return words;
}
