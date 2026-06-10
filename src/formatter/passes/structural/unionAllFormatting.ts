import {
  cloneSqlLineScanState,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment,
} from '../../sqlLineScanner';

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: SqlLineScanState;
}

interface KeywordMatch {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const SQL_WORD_START = /[A-Za-z_]/u;
const SQL_WORD_PART = /[A-Za-z0-9_$#]/u;

/**
 * Keeps UNION ALL as its own physical SQL line.
 *
 * The rewrite is deliberately lexical and only looks outside strings, quoted identifiers and
 * comments. This prevents compact query chains such as `SELECT 1 UNION ALL SELECT 2` from being
 * treated as one long statement while leaving literal/comment text untouched.
 */
export function expandUnionAllLine(
  line: string,
  initialState: SqlLineScanState,
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState);

  if (scanResult.nextState.inBlockComment) {
    return { lines: [line], nextState: scanResult.nextState };
  }

  const unionAllMatches = findUnionAllMatches(line, scanResult.outsideSegments);

  if (unionAllMatches.length === 0) {
    return { lines: [line], nextState: scanResult.nextState };
  }

  const expandedLines = splitLineAroundUnionAll(line, unionAllMatches);

  return {
    lines: expandedLines.length > 0 ? expandedLines : [line],
    nextState: cloneSqlLineScanState(scanResult.nextState),
  };
}

function findUnionAllMatches(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
): KeywordMatch[] {
  const matches: KeywordMatch[] = [];

  for (const segment of outsideSegments) {
    let index = segment.start;

    while (index < segment.end) {
      const unionStart = findWordStart(line, index, segment.end);

      if (unionStart < 0) {
        break;
      }

      const unionWord = readWordAt(line, unionStart);

      if (!unionWord || unionWord.end > segment.end) {
        break;
      }

      if (unionWord.text.toLowerCase() !== 'union') {
        index = unionWord.end;
        continue;
      }

      const allStart = findWordStart(line, unionWord.end, segment.end);
      const allWord = allStart >= 0 ? readWordAt(line, allStart) : undefined;

      if (allWord && allWord.end <= segment.end && allWord.text.toLowerCase() === 'all') {
        matches.push({
          start: unionWord.start,
          end: allWord.end,
          text: line.slice(unionWord.start, allWord.end),
        });
        index = allWord.end;
        continue;
      }

      index = unionWord.end;
    }
  }

  return matches;
}

function splitLineAroundUnionAll(line: string, matches: readonly KeywordMatch[]): string[] {
  const lines: string[] = [];
  let segmentStart = 0;

  for (const match of matches) {
    pushTrimmed(lines, line.slice(segmentStart, match.start));
    lines.push(match.text.trim());
    segmentStart = match.end;
  }

  pushTrimmed(lines, line.slice(segmentStart));

  return lines;
}

function pushTrimmed(lines: string[], value: string): void {
  const trimmed = value.trim();

  if (trimmed.length > 0) {
    lines.push(trimmed);
  }
}

function findWordStart(line: string, start: number, end: number): number {
  for (let index = start; index < end; index += 1) {
    if (SQL_WORD_START.test(line[index])) {
      return index;
    }
  }

  return -1;
}

function readWordAt(line: string, start: number): KeywordMatch | undefined {
  if (!SQL_WORD_START.test(line[start] ?? '')) {
    return undefined;
  }

  let end = start + 1;

  while (end < line.length && SQL_WORD_PART.test(line[end])) {
    end += 1;
  }

  return { start, end, text: line.slice(start, end) };
}
