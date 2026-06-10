import type { SqlDialect } from '../../../dialects';
import {
  cloneSqlLineScanState,
  scanSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
  type SqlOutsideSegment
} from '../../sqlLineScanner';

export interface IfExpressionFormattingState {
  readonly scanState: SqlLineScanState;
  readonly pendingExpression?: PendingIfExpression;
}

interface PendingIfExpression {
  readonly sourceLines: readonly string[];
  readonly conditionParts: readonly string[];
  readonly thenParts: readonly string[];
  readonly elseParts: readonly string[];
  readonly phase: 'condition' | 'then' | 'else';
}

interface ExpandedLineResult {
  readonly lines: readonly string[];
  readonly nextState: IfExpressionFormattingState;
}

interface WordMatch {
  readonly start: number;
  readonly end: number;
  readonly normalized: string;
}

interface EndIfMatch {
  readonly start: number;
  readonly end: number;
  readonly suffix: string;
}

const SQL_WORD_START = /[A-Za-z_]/u;
const SQL_WORD_PART = /[A-Za-z0-9_$#]/u;
const PROCEDURAL_BRANCH_STARTERS = new Set([
  'alter',
  'begin',
  'call',
  'create',
  'declare',
  'delete',
  'drop',
  'execute',
  'for',
  'grant',
  'if',
  'insert',
  'leave',
  'loop',
  'open',
  'raiseerror',
  'resignal',
  'return',
  'select',
  'set',
  'signal',
  'update',
  'while'
]);

export function createInitialIfExpressionFormattingState(): IfExpressionFormattingState {
  return {
    scanState: { inBlockComment: false }
  };
}

/**
 * Keeps split Watcom IF expressions as expressions.
 *
 * Watcom supports scalar IF expressions such as:
 *   IF condition THEN value ELSE value ENDIF
 *
 * Query-clause formatting or hand-written SQL can leave those expressions split over several
 * physical lines. Without a small normalizing pass, the indentation engine sees THEN/END IF as
 * procedural block tokens and can treat the expression like control flow. This pass only joins
 * short expression-shaped IF/THEN/ELSE/ENDIF sequences; procedural branches starting with DML,
 * RETURN, SET, nested IF, etc. are left untouched.
 */
export function expandWatcomIfExpressionLine(
  line: string,
  dialect: SqlDialect,
  initialState: IfExpressionFormattingState
): ExpandedLineResult {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, initialState.scanState);
  const nextBaseState: IfExpressionFormattingState = {
    scanState: scanResult.nextState,
    pendingExpression: initialState.pendingExpression
  };

  if (dialect.id !== 'watcom' || scanResult.nextState.inBlockComment) {
    return { lines: [line], nextState: nextBaseState };
  }

  if (initialState.pendingExpression) {
    return continuePendingExpression(line, scanResult.outsideSegments, nextBaseState);
  }

  const pendingExpression = tryStartSplitIfExpression(line, scanResult.outsideSegments);

  if (!pendingExpression) {
    return { lines: [line], nextState: nextBaseState };
  }

  return {
    lines: [],
    nextState: {
      scanState: scanResult.nextState,
      pendingExpression
    }
  };
}

function continuePendingExpression(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
  state: IfExpressionFormattingState
): ExpandedLineResult {
  const pendingExpression = state.pendingExpression;

  if (!pendingExpression) {
    return { lines: [line], nextState: state };
  }

  const continued = consumeExpressionLine(pendingExpression, line, outsideSegments);

  if (!continued) {
    return {
      lines: [...flushPendingExpression(pendingExpression), line],
      nextState: {
        scanState: state.scanState
      }
    };
  }

  if (continued.completedLine) {
    return {
      lines: [continued.completedLine],
      nextState: {
        scanState: state.scanState
      }
    };
  }

  return {
    lines: [],
    nextState: {
      scanState: state.scanState,
      pendingExpression: continued.pendingExpression
    }
  };
}

function tryStartSplitIfExpression(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[]
): PendingIfExpression | undefined {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const firstContentIndex = line.search(/\S/u);
  const words = collectWords(line, outsideSegments);
  const firstWord = words[0];

  if (!firstWord || firstWord.start !== firstContentIndex || firstWord.normalized !== 'if') {
    return undefined;
  }

  const thenWord = words.find((word) => word.normalized === 'then');

  if (thenWord) {
    const elseWord = words.find((word) => word.normalized === 'else' && word.start > thenWord.end);
    const endIfMatch = findEndIf(line, outsideSegments, thenWord.end);

    if (!elseWord || !endIfMatch || elseWord.start > endIfMatch.start) {
      return undefined;
    }

    return undefined;
  }

  const condition = line.slice(firstWord.end).trim();

  if (condition.length === 0 || isProceduralBranchText(condition)) {
    return undefined;
  }

  return {
    sourceLines: [trimmed],
    conditionParts: [condition],
    thenParts: [],
    elseParts: [],
    phase: 'condition'
  };
}

interface ConsumedExpressionLine {
  readonly pendingExpression?: PendingIfExpression;
  readonly completedLine?: string;
}

function consumeExpressionLine(
  pendingExpression: PendingIfExpression,
  line: string,
  outsideSegments: readonly SqlOutsideSegment[]
): ConsumedExpressionLine | undefined {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (pendingExpression.phase === 'condition') {
    const thenWord = findKeyword(line, outsideSegments, 'then', 0);

    if (!thenWord) {
      return appendConditionLine(pendingExpression, trimmed);
    }

    const beforeThen = line.slice(0, thenWord.start).trim();
    const afterThen = line.slice(thenWord.end).trim();

    const nextExpression: PendingIfExpression = {
      sourceLines: [...pendingExpression.sourceLines, trimmed],
      conditionParts: appendNonEmpty(pendingExpression.conditionParts, beforeThen),
      thenParts: [],
      elseParts: [],
      phase: 'then'
    };

    if (afterThen.length === 0) {
      return { pendingExpression: nextExpression };
    }

    return consumeThenOrElseText(nextExpression, afterThen);
  }

  return consumeThenOrElseText(pendingExpression, trimmed);
}

function appendConditionLine(
  pendingExpression: PendingIfExpression,
  trimmed: string
): ConsumedExpressionLine | undefined {
  if (isProceduralBranchText(trimmed)) {
    return undefined;
  }

  return {
    pendingExpression: {
      ...pendingExpression,
      sourceLines: [...pendingExpression.sourceLines, trimmed],
      conditionParts: [...pendingExpression.conditionParts, trimmed]
    }
  };
}

function consumeThenOrElseText(
  pendingExpression: PendingIfExpression,
  text: string
): ConsumedExpressionLine | undefined {
  if (pendingExpression.phase === 'then') {
    const elseIndex = findKeywordIndexInText(text, 'else');

    if (elseIndex >= 0) {
      const beforeElse = text.slice(0, elseIndex).trim();
      const afterElse = text.slice(elseIndex + 'else'.length).trim();
      const nextExpression: PendingIfExpression = {
        ...pendingExpression,
        sourceLines: [...pendingExpression.sourceLines, text],
        thenParts: appendNonEmpty(pendingExpression.thenParts, beforeElse),
        phase: 'else'
      };

      if (afterElse.length === 0) {
        return { pendingExpression: nextExpression };
      }

      return consumeElseText(nextExpression, afterElse);
    }

    if (isProceduralBranchText(text)) {
      return undefined;
    }

    return {
      pendingExpression: {
        ...pendingExpression,
        sourceLines: [...pendingExpression.sourceLines, text],
        thenParts: [...pendingExpression.thenParts, text]
      }
    };
  }

  return consumeElseText(pendingExpression, text);
}

function consumeElseText(
  pendingExpression: PendingIfExpression,
  text: string
): ConsumedExpressionLine | undefined {
  const endIfMatch = findEndIfInText(text);

  if (!endIfMatch) {
    if (isProceduralBranchText(text)) {
      return undefined;
    }

    return {
      pendingExpression: {
        ...pendingExpression,
        sourceLines: [...pendingExpression.sourceLines, text],
        elseParts: [...pendingExpression.elseParts, text],
        phase: 'else'
      }
    };
  }

  const beforeEndIf = text.slice(0, endIfMatch.start).trim();

  if (beforeEndIf.length > 0 && isProceduralBranchText(beforeEndIf)) {
    return undefined;
  }

  const completedLine = createIfExpressionLine({
    ...pendingExpression,
    sourceLines: [...pendingExpression.sourceLines, text],
    elseParts: appendNonEmpty(pendingExpression.elseParts, beforeEndIf),
    phase: 'else'
  }, endIfMatch.suffix);

  return completedLine ? { completedLine } : undefined;
}

function createIfExpressionLine(pendingExpression: PendingIfExpression, suffix: string): string | undefined {
  const condition = joinParts(pendingExpression.conditionParts);
  const thenValue = joinParts(pendingExpression.thenParts);
  const elseValue = joinParts(pendingExpression.elseParts);

  if (condition.length === 0 || thenValue.length === 0 || elseValue.length === 0) {
    return undefined;
  }

  return `IF ${condition} THEN ${thenValue} ELSE ${elseValue} ENDIF${suffix}`.trimEnd();
}

function flushPendingExpression(pendingExpression: PendingIfExpression): string[] {
  return pendingExpression.sourceLines.filter((text) => text.length > 0);
}

function findEndIfInText(text: string): EndIfMatch | undefined {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(text, cloneSqlLineScanState({ inBlockComment: false }));
  return findEndIf(text, scanResult.outsideSegments, 0);
}

function findKeywordIndexInText(text: string, keyword: string): number {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(text, cloneSqlLineScanState({ inBlockComment: false }));
  const word = findKeyword(text, scanResult.outsideSegments, keyword, 0);
  return word?.start ?? -1;
}

function findKeyword(
  line: string,
  outsideSegments: readonly SqlOutsideSegment[],
  keyword: string,
  startIndex: number
): WordMatch | undefined {
  for (const segment of outsideSegments) {
    let index = Math.max(segment.start, startIndex);

    while (index < segment.end) {
      const word = readNextWord(line, index, segment.end);

      if (!word) {
        break;
      }

      if (word.normalized === keyword) {
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
  startIndex: number
): EndIfMatch | undefined {
  for (const segment of outsideSegments) {
    let index = Math.max(segment.start, startIndex);

    while (index < segment.end) {
      const firstWord = readNextWord(line, index, segment.end);

      if (!firstWord) {
        break;
      }

      if (firstWord.normalized === 'endif') {
        return {
          start: firstWord.start,
          end: firstWord.end,
          suffix: line.slice(firstWord.end).trim()
        };
      }

      if (firstWord.normalized === 'end') {
        const secondWord = readNextWord(line, firstWord.end, segment.end);

        if (secondWord?.normalized === 'if') {
          return {
            start: firstWord.start,
            end: secondWord.end,
            suffix: line.slice(secondWord.end).trim()
          };
        }
      }

      index = firstWord.end;
    }
  }

  return undefined;
}

function readNextWord(line: string, startIndex: number, endIndex: number): WordMatch | undefined {
  for (let index = startIndex; index < endIndex; index += 1) {
    if (!SQL_WORD_START.test(line[index])) {
      continue;
    }

    const start = index;
    index += 1;

    while (index < endIndex && SQL_WORD_PART.test(line[index])) {
      index += 1;
    }

    return {
      start,
      end: index,
      normalized: line.slice(start, index).toLowerCase()
    };
  }

  return undefined;
}

function collectWords(line: string, outsideSegments: readonly SqlOutsideSegment[]): WordMatch[] {
  const words: WordMatch[] = [];

  for (const segment of outsideSegments) {
    let index = segment.start;

    while (index < segment.end) {
      const word = readNextWord(line, index, segment.end);

      if (!word) {
        break;
      }

      words.push(word);
      index = word.end;
    }
  }

  return words;
}

function isProceduralBranchText(text: string): boolean {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(text, cloneSqlLineScanState({ inBlockComment: false }));
  const words = collectWords(text, scanResult.outsideSegments);
  const firstWord = words[0];

  return firstWord !== undefined && PROCEDURAL_BRANCH_STARTERS.has(firstWord.normalized);
}

function appendNonEmpty(parts: readonly string[], text: string): readonly string[] {
  return text.length > 0 ? [...parts, text] : parts;
}

function joinParts(parts: readonly string[]): string {
  return parts.map((part) => part.trim()).filter((part) => part.length > 0).join(' ');
}
