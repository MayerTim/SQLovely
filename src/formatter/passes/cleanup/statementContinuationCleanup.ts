import {
  createInitialSqlLineScanState,
  rewriteSqlLineOutsideLiteralsAndComments,
  type SqlLineScanState,
} from '../../sqlLineScanner';

export function cleanupWatcomStatementContinuations(
  lines: readonly string[],
  indentString: string,
): string[] {
  const scanState = createInitialSqlLineScanState();
  const cleanedLines: string[] = [];
  let updateSetContinuationIndent: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    let trimmed = line.trim();

    if (updateSetContinuationIndent !== undefined && isSplitAssignmentNameLine(trimmed)) {
      const nextLine = lines[index + 1];
      const nextTrimmed = nextLine?.trim() ?? '';

      if (nextTrimmed.startsWith('=')) {
        line = `${getLeadingWhitespace(line)}${trimmed} ${nextTrimmed}`;
        trimmed = line.trim();
        index += 1;
      }
    }

    if (
      updateSetContinuationIndent !== undefined &&
      trimmed.length > 0 &&
      !isUpdateSetContinuationBoundary(trimmed)
    ) {
      line = `${updateSetContinuationIndent}${trimmed}`;
    }

    const rewritten = rewriteOutsideSqlText(line, scanState, cleanupStatementOutsideSqlText);
    line = rewritten.line;
    trimmed = line.trim();

    if (
      updateSetContinuationIndent !== undefined &&
      (trimmed.length === 0 || isUpdateSetContinuationBoundary(trimmed))
    ) {
      updateSetContinuationIndent = undefined;
    }

    cleanedLines.push(line);

    if (/^set\b.+,\s*$/iu.test(trimmed)) {
      updateSetContinuationIndent = `${getLeadingWhitespace(line)}${indentString}`;
    }
  }

  return cleanedLines;
}

function rewriteOutsideSqlText(
  line: string,
  scanState: SqlLineScanState,
  rewrite: (line: string, start: number, end: number) => string,
): { readonly line: string } {
  const result = rewriteSqlLineOutsideLiteralsAndComments(
    line,
    scanState,
    (_segmentText, segment) => rewrite(line, segment.start, segment.end),
  );
  scanState.inBlockComment = result.nextState.inBlockComment;

  return { line: result.line };
}

function cleanupStatementOutsideSqlText(line: string, start: number, end: number): string {
  let result = '';

  for (let index = start; index < end; index += 1) {
    const char = line[index];

    if (char === ',') {
      result += ',';

      while (line[index + 1] === ' ' || line[index + 1] === '\t') {
        index += 1;
      }

      const next = nextNonWhitespaceCharacter(line, index + 1);

      if (next !== undefined) {
        result += ' ';
      }

      continue;
    }

    if (!isArithmeticOperator(char) || !hasOperandOnBothSides(line, index)) {
      result += char;
      continue;
    }

    result = result.replace(/[ \t]+$/u, '');
    result += ` ${char} `;

    while (line[index + 1] === ' ' || line[index + 1] === '\t') {
      index += 1;
    }
  }

  return result;
}

function isArithmeticOperator(char: string): boolean {
  return char === '+' || char === '-' || char === '*' || char === '/';
}

function hasOperandOnBothSides(text: string, operatorIndex: number): boolean {
  const left = previousNonWhitespaceCharacter(text, operatorIndex - 1);
  const right = nextNonWhitespaceCharacter(text, operatorIndex + 1);

  if (left === undefined || right === undefined) {
    return false;
  }

  return isLeftOperandCharacter(left) && isRightOperandCharacter(right);
}

function previousNonWhitespaceCharacter(text: string, startIndex: number): string | undefined {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (!/\s/u.test(text[index])) {
      return text[index];
    }
  }

  return undefined;
}

function nextNonWhitespaceCharacter(text: string, startIndex: number): string | undefined {
  for (let index = startIndex; index < text.length; index += 1) {
    if (!/\s/u.test(text[index])) {
      return text[index];
    }
  }

  return undefined;
}

function isLeftOperandCharacter(char: string): boolean {
  return /[\w\]")']/u.test(char);
}

function isRightOperandCharacter(char: string): boolean {
  return /[\w[("']/u.test(char);
}

function isSplitAssignmentNameLine(trimmedLine: string): boolean {
  return /^(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)$/u.test(trimmedLine);
}

function isUpdateSetContinuationBoundary(trimmedLine: string): boolean {
  return /^(?:where|from|order\s+by|group\s+by|having|if|else|elseif|end|select|insert|update|delete|return|grant|create|alter|for|while|do)\b/iu.test(
    trimmedLine,
  );
}

function getLeadingWhitespace(line: string): string {
  return /^\s*/u.exec(line)?.[0] ?? '';
}
