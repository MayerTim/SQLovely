import type { SqlDialect } from '../../../dialects';
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
 * Normalizes compact Watcom IF statements before the line-based formatter applies indentation.
 *
 * Older Watcom code often contains statements like:
 *   IF condition THEN RETURN 0 END IF;
 *
 * Keeping that as one physical line makes the conservative indentation pass think an IF block was
 * opened without seeing its matching END IF. Splitting it into a small block keeps indentation stable
 * and makes later continuation/indentation rules deterministic.
 */
export function expandWatcomInlineIfLine(
  line: string,
  dialect: SqlDialect,
  initialState: SqlLineScanState,
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState);

  if (dialect.id !== 'watcom' || scanResult.nextState.inBlockComment) {
    return { lines: [line], nextState: scanResult.nextState };
  }

  if (!startsWithIfOutsideComments(line, scanResult.outsideSegments)) {
    return { lines: [line], nextState: scanResult.nextState };
  }

  const expanded = tryExpandInlineIf(line, scanResult.outsideSegments);

  return { lines: expanded ?? [line], nextState: scanResult.nextState };
}

function startsWithIfOutsideComments(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
): boolean {
  const firstContentIndex = line.search(/\S/u);

  if (firstContentIndex < 0) {
    return false;
  }

  return outsideSegments.some((segment) => {
    if (firstContentIndex < segment.start || firstContentIndex >= segment.end) {
      return false;
    }

    const word = readWordAt(line, firstContentIndex);
    return word?.text.toLowerCase() === 'if';
  });
}

function tryExpandInlineIf(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
): string[] | undefined {
  const firstContentIndex = line.search(/\S/u);

  if (firstContentIndex < 0) {
    return undefined;
  }

  const ifMatch = readWordAt(line, firstContentIndex);

  if (!ifMatch || ifMatch.text.toLowerCase() !== 'if') {
    return undefined;
  }

  const thenMatch = findKeyword(line, outsideSegments, 'then', ifMatch.end);

  if (!thenMatch) {
    return undefined;
  }

  const endIfMatch = findEndIf(line, outsideSegments, thenMatch.end);
  const elseMatch = findKeyword(line, outsideSegments, 'else', thenMatch.end);

  if (elseMatch && (!endIfMatch || elseMatch.start < endIfMatch.start)) {
    // Watcom also supports expression-style IFs, for example:
    //   IF condition THEN value ELSE value ENDIF
    // Those may appear in SELECT lists and calculated assignments. Treat lines with an inline
    // ELSE before ENDIF as expressions until a statement-aware formatter can safely rewrite them.
    return undefined;
  }

  const condition = line.slice(ifMatch.end, thenMatch.start).trim();
  const afterThen = endIfMatch
    ? line.slice(thenMatch.end, endIfMatch.start).trim()
    : line.slice(thenMatch.end).trim();

  if (condition.length === 0) {
    return undefined;
  }

  // Avoid changing multi-statement inline blocks for now. They need a statement-aware formatter pass.
  if (afterThen.includes(';') && endIfMatch) {
    return undefined;
  }

  if (!endIfMatch && afterThen.length > 0) {
    return undefined;
  }

  const conditionLines = splitConditionOnLogicalOperators(condition);

  if (!endIfMatch && afterThen.length === 0 && conditionLines.length <= 1) {
    return undefined;
  }

  const lines = formatExpandedIfLines(conditionLines, afterThen, endIfMatch?.text);

  return lines.length > 1 ? lines : undefined;
}

function formatExpandedIfLines(
  conditionLines: readonly string[],
  inlineStatement: string,
  endIfText: string | undefined,
): string[] {
  const firstConditionLine = conditionLines[0];

  if (!firstConditionLine) {
    return [];
  }

  const lines = [`IF ${firstConditionLine}`];

  for (const conditionLine of conditionLines.slice(1)) {
    lines.push(conditionLine);
  }

  lines.push('THEN');

  if (inlineStatement.length > 0) {
    lines.push(inlineStatement);
  }

  if (endIfText) {
    lines.push(normalizeEndIfText(endIfText));
  }

  return lines;
}

function splitConditionOnLogicalOperators(condition: string): string[] {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(
    condition,
    cloneSqlLineScanState({ inBlockComment: false }),
  );
  const outside = new Array<boolean>(condition.length).fill(false);

  for (const segment of scanResult.outsideSegments) {
    for (let index = segment.start; index < segment.end; index += 1) {
      outside[index] = true;
    }
  }

  const parts: string[] = [];
  let lastSplit = 0;
  let parenDepth = 0;
  let betweenPending = false;
  let index = 0;

  while (index < condition.length) {
    if (!outside[index]) {
      index += 1;
      continue;
    }

    const current = condition[index];

    if (current === '(') {
      parenDepth += 1;
      index += 1;
      continue;
    }

    if (current === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      index += 1;
      continue;
    }

    if (!SQL_WORD_START.test(current)) {
      index += 1;
      continue;
    }

    const word = readWordAt(condition, index);

    if (!word) {
      index += 1;
      continue;
    }

    const normalized = word.text.toLowerCase();

    if (parenDepth === 0 && (normalized === 'and' || normalized === 'or')) {
      if (normalized === 'and' && betweenPending) {
        betweenPending = false;
      } else {
        const previousPart = condition.slice(lastSplit, word.start).trim();

        if (previousPart.length > 0) {
          parts.push(previousPart);
          lastSplit = word.start;
        }
      }
    } else if (normalized === 'between') {
      betweenPending = true;
    } else if (betweenPending && normalized !== 'not') {
      // Keep the BETWEEN flag until its separating AND was consumed.
    }

    index = word.end;
  }

  const finalPart = condition.slice(lastSplit).trim();

  if (finalPart.length > 0) {
    parts.push(finalPart);
  }

  return parts.length > 0 ? parts : [condition.trim()];
}

function findKeyword(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
  keyword: string,
  startIndex: number,
): KeywordMatch | undefined {
  for (const segment of outsideSegments) {
    let index = Math.max(segment.start, startIndex);

    while (index < segment.end) {
      const nextIndex = findWordStart(line, index, segment.end);

      if (nextIndex < 0) {
        break;
      }

      const word = readWordAt(line, nextIndex);

      if (!word || word.end > segment.end) {
        break;
      }

      if (word.text.toLowerCase() === keyword) {
        return word;
      }

      index = word.end;
    }
  }

  return undefined;
}

function findEndIf(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
  startIndex: number,
): KeywordMatch | undefined {
  for (const segment of outsideSegments) {
    let index = Math.max(segment.start, startIndex);

    while (index < segment.end) {
      const nextIndex = findWordStart(line, index, segment.end);

      if (nextIndex < 0) {
        break;
      }

      const firstWord = readWordAt(line, nextIndex);

      if (!firstWord || firstWord.end > segment.end) {
        break;
      }

      const normalized = firstWord.text.toLowerCase();

      if (normalized === 'endif') {
        return firstWord;
      }

      if (normalized === 'end') {
        const secondWordStart = findWordStart(line, firstWord.end, segment.end);
        const secondWord = secondWordStart >= 0 ? readWordAt(line, secondWordStart) : undefined;

        if (secondWord && secondWord.end <= segment.end && secondWord.text.toLowerCase() === 'if') {
          const trailingSemicolonEnd = consumeOptionalSemicolon(line, secondWord.end, segment.end);
          return {
            start: firstWord.start,
            end: trailingSemicolonEnd,
            text: line.slice(firstWord.start, trailingSemicolonEnd),
          };
        }
      }

      index = firstWord.end;
    }
  }

  return undefined;
}

function normalizeEndIfText(text: string): string {
  return /;\s*$/u.test(text) ? 'END IF;' : 'END IF';
}

function consumeOptionalSemicolon(line: string, start: number, segmentEnd: number): number {
  let index = start;

  while (index < segmentEnd && /\s/u.test(line[index])) {
    index += 1;
  }

  return line[index] === ';' ? index + 1 : start;
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
