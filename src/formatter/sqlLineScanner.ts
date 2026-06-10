export interface SqlLineScanState {
  inBlockComment: boolean;
}

export interface SqlOutsideSegment {
  readonly start: number;
  readonly end: number;
}

export interface SqlLineScanResult {
  readonly outsideSegments: readonly SqlOutsideSegment[];
  readonly nextState: SqlLineScanState;
}

export interface SqlWordMatch {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly normalized: string;
}

export interface SqlWordDepthMatch extends SqlWordMatch {
  readonly depth: number;
}

const SQL_WORD_START_PATTERN = /[A-Za-z_]/u;
const SQL_WORD_PART_PATTERN = /[A-Za-z0-9_$#]/u;

export function isSqlWordStart(character: string | undefined): boolean {
  return character !== undefined && SQL_WORD_START_PATTERN.test(character);
}

export function isSqlWordPart(character: string | undefined): boolean {
  return character !== undefined && SQL_WORD_PART_PATTERN.test(character);
}

export function readSqlWordAt(
  line: string,
  start: number,
  endIndex = line.length,
): SqlWordMatch | undefined {
  if (!isSqlWordStart(line[start])) {
    return undefined;
  }

  let end = start + 1;

  while (end < line.length && isSqlWordPart(line[end])) {
    end += 1;
  }

  if (end > endIndex) {
    return undefined;
  }

  const text = line.slice(start, end);

  return {
    start,
    end,
    text,
    normalized: text.toLowerCase(),
  };
}

export function readSqlWordBefore(line: string, index: number): SqlWordMatch | undefined {
  let cursor = index - 1;

  while (cursor >= 0 && /\s/u.test(line[cursor])) {
    cursor -= 1;
  }

  const end = cursor + 1;

  while (cursor >= 0 && isSqlWordPart(line[cursor])) {
    cursor -= 1;
  }

  const start = cursor + 1;

  if (start === end || !isSqlWordStart(line[start])) {
    return undefined;
  }

  const text = line.slice(start, end);

  return {
    start,
    end,
    text,
    normalized: text.toLowerCase(),
  };
}

export function findNextSqlWord(
  line: string,
  startIndex: number,
  endIndex: number,
): SqlWordMatch | undefined {
  for (let index = startIndex; index < endIndex; index += 1) {
    const word = readSqlWordAt(line, index, endIndex);

    if (word) {
      return word;
    }
  }

  return undefined;
}

export function collectSqlWordsFromSegments(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
): readonly SqlWordMatch[] {
  const words: SqlWordMatch[] = [];

  for (const segment of outsideSegments) {
    let index = segment.start;

    while (index < segment.end) {
      const word = findNextSqlWord(line, index, segment.end);

      if (!word) {
        break;
      }

      words.push(word);
      index = word.end;
    }
  }

  return words;
}

export function collectSqlWordsWithParenthesisDepth(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
  initialDepth = 0,
): readonly SqlWordDepthMatch[] {
  const words: SqlWordDepthMatch[] = [];
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

      const word = readSqlWordAt(line, index, segment.end);

      if (!word) {
        index += 1;
        continue;
      }

      words.push({ ...word, depth });
      index = word.end;
    }
  }

  return words;
}

export function createInitialSqlLineScanState(): SqlLineScanState {
  return { inBlockComment: false };
}

export function cloneSqlLineScanState(state: SqlLineScanState): SqlLineScanState {
  return { inBlockComment: state.inBlockComment };
}

export function createSqlOutsideLookup(
  length: number,
  outsideSegments: readonly SqlOutsideSegment[],
): readonly boolean[] {
  const outside = new Array<boolean>(length).fill(false);

  for (const segment of outsideSegments) {
    for (let index = segment.start; index < segment.end; index += 1) {
      outside[index] = true;
    }
  }

  return outside;
}

export function rewriteSqlLineOutsideLiteralsAndComments(
  line: string,
  initialState: SqlLineScanState,
  rewrite: (segmentText: string, segment: SqlOutsideSegment) => string,
): { readonly line: string; readonly nextState: SqlLineScanState } {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState);
  let rewritten = '';
  let cursor = 0;

  for (const segment of scanResult.outsideSegments) {
    rewritten += line.slice(cursor, segment.start);
    rewritten += rewrite(line.slice(segment.start, segment.end), segment);
    cursor = segment.end;
  }

  rewritten += line.slice(cursor);

  return { line: rewritten, nextState: scanResult.nextState };
}

export function scanSqlLineOutsideLiteralsAndComments(
  line: string,
  initialState: SqlLineScanState,
): SqlLineScanResult {
  const outsideSegments: SqlOutsideSegment[] = [];
  const state = cloneSqlLineScanState(initialState);
  let index = 0;
  let outsideStart = state.inBlockComment ? -1 : 0;

  while (index < line.length) {
    if (state.inBlockComment) {
      const blockEnd = line.indexOf('*/', index);

      if (blockEnd === -1) {
        return { outsideSegments, nextState: state };
      }

      state.inBlockComment = false;
      index = blockEnd + 2;
      outsideStart = index;
      continue;
    }

    if (line.startsWith('--', index) || line.startsWith('//', index)) {
      pushOutsideSegment(outsideSegments, outsideStart, index);
      outsideStart = -1;
      break;
    }

    if (line.startsWith('/*', index)) {
      pushOutsideSegment(outsideSegments, outsideStart, index);
      outsideStart = -1;

      const blockEnd = line.indexOf('*/', index + 2);

      if (blockEnd === -1) {
        state.inBlockComment = true;
        break;
      }

      index = blockEnd + 2;
      outsideStart = index;
      continue;
    }

    const current = line[index];

    if (current === "'") {
      pushOutsideSegment(outsideSegments, outsideStart, index);
      index = skipSingleQuotedString(line, index);
      outsideStart = index;
      continue;
    }

    if (current === '"') {
      pushOutsideSegment(outsideSegments, outsideStart, index);
      index = skipDoubleQuotedIdentifier(line, index);
      outsideStart = index;
      continue;
    }

    if (current === '[') {
      pushOutsideSegment(outsideSegments, outsideStart, index);
      const bracketEnd = line.indexOf(']', index + 1);
      index = bracketEnd === -1 ? line.length : bracketEnd + 1;
      outsideStart = index;
      continue;
    }

    index += 1;
  }

  pushOutsideSegment(outsideSegments, outsideStart, line.length);

  return { outsideSegments, nextState: state };
}

function pushOutsideSegment(segments: SqlOutsideSegment[], start: number, end: number): void {
  if (start >= 0 && end > start) {
    segments.push({ start, end });
  }
}

function skipSingleQuotedString(line: string, quoteStart: number): number {
  let index = quoteStart + 1;

  while (index < line.length) {
    if (line[index] === "'") {
      if (line[index + 1] === "'") {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index += 1;
  }

  return line.length;
}

function skipDoubleQuotedIdentifier(line: string, quoteStart: number): number {
  let index = quoteStart + 1;

  while (index < line.length) {
    if (line[index] === '"') {
      if (line[index + 1] === '"') {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index += 1;
  }

  return line.length;
}
