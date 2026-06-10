import type { SqlDialect } from '../../../dialects';
import {
  cloneSqlLineScanState,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment,
} from '../../sqlLineScanner';

export interface CursorForFormattingState {
  readonly scanState: SqlLineScanState;
  readonly inCursorQuery: boolean;
}

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: CursorForFormattingState;
}

interface WordMatch {
  readonly start: number;
  readonly end: number;
  readonly normalized: string;
  readonly depth: number;
}

const SQL_WORD_START = /[A-Za-z_]/u;
const SQL_WORD_PART = /[A-Za-z0-9_$#]/u;

export function createInitialCursorForFormattingState(): CursorForFormattingState {
  return {
    scanState: { inBlockComment: false },
    inCursorQuery: false,
  };
}

/**
 * Splits compact Watcom cursor FOR loops into stable structural lines.
 *
 * The formatter pass is intentionally lexical and only rewrites tokens outside strings, quoted
 * identifiers and comments. Cursor declarations such as
 * `FOR c AS ... CURSOR FOR SELECT ... DO` are split so the cursor query can be indented
 * independently and `DO` can behave as the loop body opener.
 */
export function expandWatcomCursorForLine(
  line: string,
  dialect: SqlDialect,
  initialState: CursorForFormattingState,
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState.scanState);
  const baseNextState: CursorForFormattingState = {
    scanState: scanResult.nextState,
    inCursorQuery: initialState.inCursorQuery,
  };

  if (dialect.id !== 'watcom' || scanResult.nextState.inBlockComment) {
    return { lines: [line], nextState: baseNextState };
  }

  const words = collectWords(line, scanResult.outsideSegments);
  const { splitPoints, inCursorQuery } = findCursorForSplitPoints(
    words,
    initialState.inCursorQuery,
  );

  if (splitPoints.length === 0) {
    return {
      lines: [line],
      nextState: {
        scanState: scanResult.nextState,
        inCursorQuery,
      },
    };
  }

  return {
    lines: splitLineAtIndexes(line, splitPoints),
    nextState: {
      scanState: cloneSqlLineScanState(scanResult.nextState),
      inCursorQuery,
    },
  };
}

function findCursorForSplitPoints(
  words: readonly WordMatch[],
  isAlreadyInCursorQuery: boolean,
): { readonly splitPoints: readonly number[]; readonly inCursorQuery: boolean } {
  const firstWord = words[0];

  if (!firstWord) {
    return { splitPoints: [], inCursorQuery: isAlreadyInCursorQuery };
  }

  if (isAlreadyInCursorQuery) {
    const doWord = findNextTopLevelWord(words, 0, 'do');
    return {
      splitPoints: doWord && doWord.start > 0 ? [doWord.start] : [],
      inCursorQuery: !doWord,
    };
  }

  if (firstWord.normalized !== 'for' || firstWord.depth !== 0) {
    return { splitPoints: [], inCursorQuery: false };
  }

  const cursorForIndex = findCursorForPhraseIndex(words);

  if (cursorForIndex < 0) {
    return {
      splitPoints: findPlainForDoSplitPoints(words),
      inCursorQuery: false,
    };
  }

  const selectIndex = findNextTopLevelWordIndex(words, cursorForIndex + 2, 'select');
  const doIndex = findNextTopLevelWordIndex(
    words,
    selectIndex >= 0 ? selectIndex + 1 : cursorForIndex + 2,
    'do',
  );
  const splitPoints: number[] = [];

  if (selectIndex >= 0) {
    splitPoints.push(words[selectIndex].start);
  }

  if (doIndex >= 0) {
    splitPoints.push(words[doIndex].start);
  }

  return {
    splitPoints,
    inCursorQuery: doIndex < 0,
  };
}

function findPlainForDoSplitPoints(words: readonly WordMatch[]): number[] {
  const doWord = findNextTopLevelWord(words, 1, 'do');

  return doWord ? [doWord.start] : [];
}

function findCursorForPhraseIndex(words: readonly WordMatch[]): number {
  for (let index = 0; index < words.length - 1; index += 1) {
    const word = words[index];
    const nextWord = words[index + 1];

    if (
      word.depth === 0 &&
      nextWord.depth === 0 &&
      word.normalized === 'cursor' &&
      nextWord.normalized === 'for'
    ) {
      return index;
    }
  }

  return -1;
}

function findNextTopLevelWord(
  words: readonly WordMatch[],
  startIndex: number,
  normalized: string,
): WordMatch | undefined {
  const index = findNextTopLevelWordIndex(words, startIndex, normalized);
  return index >= 0 ? words[index] : undefined;
}

function findNextTopLevelWordIndex(
  words: readonly WordMatch[],
  startIndex: number,
  normalized: string,
): number {
  for (let index = startIndex; index < words.length; index += 1) {
    const word = words[index];

    if (word.depth === 0 && word.normalized === normalized) {
      return index;
    }
  }

  return -1;
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

function collectWords(line: string, outsideSegments: readonly SqlOutsideSegment[]): WordMatch[] {
  const words: WordMatch[] = [];
  let depth = 0;

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

function pushTrimmed(lines: string[], value: string): void {
  const trimmed = value.trim();

  if (trimmed.length > 0) {
    lines.push(trimmed);
  }
}
