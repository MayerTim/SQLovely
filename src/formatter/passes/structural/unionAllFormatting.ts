import {
  cloneSqlLineScanState,
  findNextSqlWord,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment,
  type SqlWordMatch,
} from '../../sqlLineScanner';

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: SqlLineScanState;
}

type KeywordMatch = SqlWordMatch;

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
      const unionWord = findNextSqlWord(line, index, segment.end);

      if (!unionWord) {
        break;
      }

      if (unionWord.normalized !== 'union') {
        index = unionWord.end;
        continue;
      }

      const allWord = findNextSqlWord(line, unionWord.end, segment.end);

      if (allWord?.normalized === 'all') {
        matches.push({
          start: unionWord.start,
          end: allWord.end,
          text: line.slice(unionWord.start, allWord.end),
          normalized: line.slice(unionWord.start, allWord.end).toLowerCase(),
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
