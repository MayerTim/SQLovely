import {
  cloneSqlLineScanState,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment
} from '../../sqlLineScanner';

export interface ParenthesisFormattingState {
  readonly scanState: SqlLineScanState;
  readonly parenthesisDepth: number;
}

export interface ParenthesisExpansionResult {
  readonly lines: readonly string[];
  readonly nextState: ParenthesisFormattingState;
}

export interface ParenthesisIndentAnalysis {
  readonly leadingClosingParentheses: number;
  readonly depthDelta: number;
  readonly nextScanState: SqlLineScanState;
}

const SQL_WORD_PART = /[A-Za-z0-9_$#]/u;
const TYPE_LENGTH_WORDS = new Set([
  'binary',
  'bit',
  'char',
  'character',
  'date',
  'datetime',
  'decimal',
  'double',
  'float',
  'int',
  'integer',
  'long',
  'money',
  'numeric',
  'nchar',
  'nvarchar',
  'real',
  'smalldatetime',
  'smallint',
  'smallmoney',
  'time',
  'timestamp',
  'tinyint',
  'uniqueidentifier',
  'varbinary',
  'varchar'
]);

export function createInitialParenthesisFormattingState(): ParenthesisFormattingState {
  return {
    scanState: { inBlockComment: false },
    parenthesisDepth: 0
  };
}

/**
 * Splits non-empty parenthesized SQL argument/list groups into separate physical lines.
 *
 * The formatter is deliberately lexical rather than semantic: it only rewrites parentheses that
 * appear outside strings, quoted identifiers and comments. Empty calls like proc() and compact type
 * lengths such as varchar(14) stay inline to avoid noisy formatting of common SQL declarations.
 */
export function expandParenthesesInLine(line: string, initialState: ParenthesisFormattingState): ParenthesisExpansionResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState.scanState);
  const outside = createOutsideLookup(line.length, scanResult.outsideSegments);

  if (!lineContainsSplittableParenthesis(line, outside, initialState.parenthesisDepth)) {
    return {
      lines: [line],
      nextState: {
        scanState: scanResult.nextState,
        parenthesisDepth: updateDepthFromLine(line, outside, initialState.parenthesisDepth)
      }
    };
  }

  const lines: string[] = [];
  let current = '';
  let depth = initialState.parenthesisDepth;
  let index = 0;

  const pushCurrentLine = (): void => {
    const trimmed = current.trim();

    if (trimmed.length > 0) {
      lines.push(trimmed);
    }

    current = '';
  };

  while (index < line.length) {
    if (!outside[index]) {
      current += line[index];
      index += 1;
      continue;
    }

    const char = line[index];

    if (char === '(') {
      const inlineEnd = findInlineParenthesisEndToKeep(line, index, outside);

      if (inlineEnd !== undefined) {
        current += line.slice(index, inlineEnd + 1);
        index = inlineEnd + 1;
        continue;
      }

      current = current.replace(/[ \t]+$/u, '') + '(';
      pushCurrentLine();
      depth += 1;
      index += 1;
      index = skipWhitespace(line, index);
      continue;
    }

    if (char === ')') {
      pushCurrentLine();
      current = ')';
      depth = Math.max(0, depth - 1);
      index += 1;

      const afterWhitespaceIndex = skipWhitespace(line, index);
      index = appendTrailingClosePunctuation(line, index, outside, (value) => {
        current += value;
      });

      if (index > afterWhitespaceIndex || skipWhitespace(line, index) >= line.length) {
        pushCurrentLine();
        index = skipWhitespace(line, index);
      } else {
        current += ' ';
        index = afterWhitespaceIndex;
      }

      continue;
    }

    if (char === ',' && depth > 0) {
      current = current.replace(/[ \t]+$/u, '') + ',';
      pushCurrentLine();
      index += 1;
      index = skipWhitespace(line, index);
      continue;
    }

    current += char;
    index += 1;
  }

  pushCurrentLine();

  return {
    lines: lines.length > 0 ? lines : [line],
    nextState: {
      scanState: scanResult.nextState,
      parenthesisDepth: depth
    }
  };
}

export function analyzeParenthesesForIndent(line: string, initialState: SqlLineScanState): ParenthesisIndentAnalysis {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState);
  const outside = createOutsideLookup(line.length, scanResult.outsideSegments);
  let leadingClosingParentheses = 0;
  let depthDelta = 0;
  let hasSeenNonWhitespace = false;

  for (let index = 0; index < line.length; index += 1) {
    if (!outside[index]) {
      continue;
    }

    const char = line[index];

    if (!hasSeenNonWhitespace && /\s/u.test(char)) {
      continue;
    }

    if (char === '(') {
      hasSeenNonWhitespace = true;
      depthDelta += 1;
      continue;
    }

    if (char === ')') {
      if (!hasSeenNonWhitespace) {
        leadingClosingParentheses += 1;
      }

      hasSeenNonWhitespace = true;
      depthDelta -= 1;
      continue;
    }

    if (!/\s/u.test(char)) {
      hasSeenNonWhitespace = true;
    }
  }

  return {
    leadingClosingParentheses,
    depthDelta,
    nextScanState: scanResult.nextState
  };
}

function lineContainsSplittableParenthesis(line: string, outside: readonly boolean[], initialDepth: number): boolean {
  let depth = initialDepth;

  for (let index = 0; index < line.length; index += 1) {
    if (!outside[index]) {
      continue;
    }

    const char = line[index];

    if (char === '(') {
      const inlineEnd = findInlineParenthesisEndToKeep(line, index, outside);

      if (inlineEnd !== undefined) {
        index = inlineEnd;
        continue;
      }

      return true;
    }

    if (char === ')') {
      return true;
    }

    if (char === ',' && depth > 0) {
      return true;
    }
  }

  return false;
}

function updateDepthFromLine(line: string, outside: readonly boolean[], initialDepth: number): number {
  let depth = initialDepth;

  for (let index = 0; index < line.length; index += 1) {
    if (!outside[index]) {
      continue;
    }

    const char = line[index];

    if (char === '(') {
      const inlineEnd = findInlineParenthesisEndToKeep(line, index, outside);

      if (inlineEnd !== undefined) {
        index = inlineEnd;
        continue;
      }

      depth += 1;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    }
  }

  return depth;
}

function findInlineParenthesisEndToKeep(line: string, openIndex: number, outside: readonly boolean[]): number | undefined {
  const closeIndex = findMatchingCloseOnSameLine(line, openIndex, outside);

  if (closeIndex === undefined) {
    return undefined;
  }

  const inner = line.slice(openIndex + 1, closeIndex);

  if (inner.trim().length === 0) {
    return closeIndex;
  }

  if (isTypeLengthParenthesis(line, openIndex, inner)) {
    return closeIndex;
  }

  return undefined;
}

function findMatchingCloseOnSameLine(line: string, openIndex: number, outside: readonly boolean[]): number | undefined {
  let depth = 0;

  for (let index = openIndex; index < line.length; index += 1) {
    if (!outside[index]) {
      continue;
    }

    if (line[index] === '(') {
      depth += 1;
    } else if (line[index] === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

function isTypeLengthParenthesis(line: string, openIndex: number, inner: string): boolean {
  if (!/^\s*\d+(?:\s*,\s*\d+)?\s*$/u.test(inner)) {
    return false;
  }

  const previousWord = readWordBefore(line, openIndex);
  return previousWord !== undefined && TYPE_LENGTH_WORDS.has(previousWord.toLowerCase());
}

function readWordBefore(line: string, index: number): string | undefined {
  let cursor = index - 1;

  while (cursor >= 0 && /\s/u.test(line[cursor])) {
    cursor -= 1;
  }

  const end = cursor + 1;

  while (cursor >= 0 && SQL_WORD_PART.test(line[cursor])) {
    cursor -= 1;
  }

  if (end === cursor + 1) {
    return undefined;
  }

  return line.slice(cursor + 1, end);
}

function createOutsideLookup(length: number, outsideSegments: readonly SqlOutsideSegment[]): boolean[] {
  const outside = new Array<boolean>(length).fill(false);

  for (const segment of outsideSegments) {
    for (let index = segment.start; index < segment.end; index += 1) {
      outside[index] = true;
    }
  }

  return outside;
}

function skipWhitespace(line: string, start: number): number {
  let index = start;

  while (index < line.length && /[ \t]/u.test(line[index])) {
    index += 1;
  }

  return index;
}

function appendTrailingClosePunctuation(
  line: string,
  start: number,
  outside: readonly boolean[],
  append: (value: string) => void
): number {
  let index = start;

  while (index < line.length && outside[index] && /[ \t]/u.test(line[index])) {
    index += 1;
  }

  while (index < line.length && outside[index] && (line[index] === ',' || line[index] === ';')) {
    append(line[index]);
    index += 1;
  }

  return index;
}

export function cloneParenthesisFormattingStateForTesting(
  state: ParenthesisFormattingState
): ParenthesisFormattingState {
  return {
    scanState: cloneSqlLineScanState(state.scanState),
    parenthesisDepth: state.parenthesisDepth
  };
}
