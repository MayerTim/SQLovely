import type { SqlDialect } from '../dialects';
import type { KeywordCase } from './options';
import {
  createInitialSqlLineScanState,
  scanSqlLineOutsideLiteralsAndComments,
  rewriteSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
} from './sqlLineScanner';

const SQL_WORD_PATTERN = /[A-Za-z_][A-Za-z0-9_$#]*/g;

export function applyKeywordCaseToText(
  text: string,
  dialect: SqlDialect,
  keywordCase: KeywordCase,
): string {
  if (keywordCase === 'preserve') {
    return text;
  }

  const { eol, lines, hadFinalNewline } = splitSqlText(text);
  let scanState = createInitialSqlLineScanState();

  const formattedLines = lines.map((line) => {
    const result = applyKeywordCaseToLine(line, dialect, keywordCase, scanState);
    scanState = result.nextState;
    return result.line;
  });

  return formattedLines.join(eol) + (hadFinalNewline ? eol : '');
}

export function applyKeywordCaseToLine(
  line: string,
  dialect: SqlDialect,
  keywordCase: KeywordCase,
  scanState: SqlLineScanState,
): { readonly line: string; readonly nextState: SqlLineScanState } {
  if (keywordCase === 'preserve') {
    const scanResult = scanSqlLineOutsideLiteralsAndComments(line, scanState);
    return { line, nextState: scanResult.nextState };
  }

  const result = rewriteSqlLineOutsideLiteralsAndComments(line, scanState, (segmentText) =>
    transformSqlWords(segmentText, dialect, keywordCase),
  );

  return { line: result.line, nextState: result.nextState };
}

export function collectSqlWordsOutsideLiteralsAndComments(
  line: string,
  scanState: SqlLineScanState,
): { readonly words: readonly string[]; readonly nextState: SqlLineScanState } {
  const scanResult = scanSqlLineOutsideLiteralsAndComments(line, scanState);
  const words: string[] = [];

  for (const segment of scanResult.outsideSegments) {
    const outsideText = line.slice(segment.start, segment.end);
    let match: RegExpExecArray | null;

    SQL_WORD_PATTERN.lastIndex = 0;
    while ((match = SQL_WORD_PATTERN.exec(outsideText)) !== null) {
      const previousCharacter = outsideText[match.index - 1];

      if (previousCharacter === '@' || previousCharacter === '#') {
        continue;
      }

      words.push(match[0].toLowerCase());
    }
  }

  return { words, nextState: scanResult.nextState };
}

function transformSqlWords(
  segmentText: string,
  dialect: SqlDialect,
  keywordCase: KeywordCase,
): string {
  return segmentText.replace(SQL_WORD_PATTERN, (word: string, offset: number) => {
    const previousCharacter = segmentText[offset - 1];

    if (previousCharacter === '@' || previousCharacter === '#') {
      return word;
    }

    const normalized = word.toLowerCase();

    if (!dialect.keywords.has(normalized) && !dialect.builtinFunctions.has(normalized)) {
      return word;
    }

    return keywordCase === 'upper' ? word.toUpperCase() : word.toLowerCase();
  });
}

function splitSqlText(text: string): {
  readonly eol: string;
  readonly lines: readonly string[];
  readonly hadFinalNewline: boolean;
} {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalNewline = /(?:\r\n|\r|\n)$/.test(text);
  const lines = text.split(/\r\n|\r|\n/);

  if (hadFinalNewline) {
    lines.pop();
  }

  return { eol, lines, hadFinalNewline };
}
