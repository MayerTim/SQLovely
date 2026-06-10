import type { SqlDialect } from '../../../dialects';
import {
  collectSqlWordsFromSegments,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment,
} from '../../sqlLineScanner';

export interface BlockEndFormattingState {
  readonly scanState: SqlLineScanState;
}

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: BlockEndFormattingState;
}

interface EndPhraseToken {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly hasSemicolon: boolean;
}

const BLOCK_END_FOLLOWERS = new Set(['if', 'for', 'loop', 'while', 'try', 'catch']);

export function createInitialBlockEndFormattingState(): BlockEndFormattingState {
  return {
    scanState: { inBlockComment: false },
  };
}

/**
 * Splits stacked Watcom block terminators before the indentation pass sees them.
 *
 * Real-world exports sometimes contain compact nested endings such as:
 *   END IF END IF;
 *   END IF END IF END FOR;
 *
 * If these stay on one physical line, the line-based indentation engine only decreases the
 * block depth once and every following object remains over-indented. This pass is deliberately
 * narrow: it only rewrites lines that consist solely of repeated block-end phrases outside
 * strings, quoted identifiers and comments.
 */
export function expandWatcomBlockEndLine(
  line: string,
  dialect: SqlDialect,
  initialState: BlockEndFormattingState,
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState.scanState);
  const nextState = { scanState: scanResult.nextState };

  if (dialect.id !== 'watcom' || scanResult.nextState.inBlockComment) {
    return { lines: [line], nextState };
  }

  const expanded = trySplitStackedBlockEnds(line, scanResult.outsideSegments);

  return { lines: expanded ?? [line], nextState };
}

function trySplitStackedBlockEnds(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
): string[] | undefined {
  const trimmed = line.trim();

  if (!/^end\b/i.test(trimmed) && !/^endif\b/i.test(trimmed)) {
    return undefined;
  }

  const endPhrases = collectBlockEndPhrases(line, outsideSegments);

  if (endPhrases.length < 2 || !lineContainsOnlyBlockEnds(line, endPhrases)) {
    return undefined;
  }

  return endPhrases.map((phrase) => phrase.text + (phrase.hasSemicolon ? ';' : ''));
}

function collectBlockEndPhrases(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
): EndPhraseToken[] {
  const words = collectSqlWordsFromSegments(line, outsideSegments);
  const phrases: EndPhraseToken[] = [];
  let index = 0;

  while (index < words.length) {
    const current = words[index];

    if (current.normalized === 'endif') {
      const semicolonEnd = consumeOptionalSemicolon(line, current.end);
      phrases.push({
        start: current.start,
        end: semicolonEnd.end,
        text: line.slice(current.start, current.end),
        hasSemicolon: semicolonEnd.hasSemicolon,
      });
      index += 1;
      continue;
    }

    if (current.normalized === 'end') {
      const next = words[index + 1];

      if (next && BLOCK_END_FOLLOWERS.has(next.normalized)) {
        const semicolonEnd = consumeOptionalSemicolon(line, next.end);
        phrases.push({
          start: current.start,
          end: semicolonEnd.end,
          text: line.slice(current.start, next.end).replace(/\s+/gu, ' '),
          hasSemicolon: semicolonEnd.hasSemicolon,
        });
        index += 2;
        continue;
      }
    }

    index += 1;
  }

  return phrases;
}

function lineContainsOnlyBlockEnds(line: string, phrases: readonly EndPhraseToken[]): boolean {
  if (phrases.length === 0) {
    return false;
  }

  const sortedPhrases = [...phrases].sort((left, right) => left.start - right.start);
  let phraseIndex = 0;

  for (let index = 0; index < line.length; index += 1) {
    const phrase = sortedPhrases[phraseIndex];

    if (phrase && index === phrase.start) {
      index = phrase.end - 1;
      phraseIndex += 1;
      continue;
    }

    if (!/\s/u.test(line[index])) {
      return false;
    }
  }

  return phraseIndex === sortedPhrases.length;
}

function consumeOptionalSemicolon(
  line: string,
  start: number,
): { readonly end: number; readonly hasSemicolon: boolean } {
  let index = start;

  while (index < line.length && /\s/u.test(line[index])) {
    index += 1;
  }

  if (line[index] === ';') {
    return { end: index + 1, hasSemicolon: true };
  }

  return { end: start, hasSemicolon: false };
}
