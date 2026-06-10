import { createInitialSqlLineScanState, scanSqlLineOutsideLiteralsAndComments } from '../../sqlLineScanner';

interface ParenthesisFrame {
  readonly indent: string;
  readonly openerText: string;
  readonly isDdlList: boolean;
}

/**
 * Aligns Watcom DDL/list closing parentheses after the general parenthesis splitter.
 *
 * The main indentation pass intentionally treats all parenthesized lines as generic
 * continuations. That is useful for function arguments, but Watcom DDL declarations such as
 * `DECLARE LOCAL TEMPORARY TABLE (...) ON COMMIT ...` should align the closing `)` with the
 * declaration line. This pass is deliberately narrow and only adjusts parenthesis groups whose
 * opener is a DDL/list declaration outside strings and comments.
 */
export function cleanupWatcomDdlParentheses(lines: readonly string[]): string[] {
  const scanState = createInitialSqlLineScanState();
  const cleanedLines = [...lines];
  const stack: ParenthesisFrame[] = [];

  for (let lineIndex = 0; lineIndex < cleanedLines.length; lineIndex += 1) {
    let line = cleanedLines[lineIndex];
    const trimmed = line.trim();

    if (trimmed.startsWith(')')) {
      const frame = stack[stack.length - 1];

      if (frame?.isDdlList) {
        const previousLineIndex = findPreviousNonBlankLineIndex(cleanedLines, lineIndex - 1);

        if (previousLineIndex >= 0) {
          cleanedLines[previousLineIndex] = removeTrailingComma(cleanedLines[previousLineIndex]);
        }

        line = `${frame.indent}${trimmed}`;
        cleanedLines[lineIndex] = line;
      }
    }

    const scanResult = scanSqlLineOutsideLiteralsAndComments(line, scanState);

    for (const segment of scanResult.outsideSegments) {
      for (let index = segment.start; index < segment.end; index += 1) {
        const char = line[index];

        if (char === '(') {
          const openerText = line.slice(0, index + 1).trim();
          stack.push({
            indent: getLeadingWhitespace(line),
            openerText,
            isDdlList: isWatcomDdlListOpener(openerText)
          });
        } else if (char === ')') {
          stack.pop();
        }
      }
    }

    scanState.inBlockComment = scanResult.nextState.inBlockComment;
  }

  return cleanedLines;
}

function isWatcomDdlListOpener(openerText: string): boolean {
  const normalized = openerText.replace(/\s+/gu, ' ').trim();

  return /^(?:declare\s+(?:local\s+)?temporary\s+table|create\s+(?:local\s+)?temporary\s+table|create\s+table|alter\s+table)\b.+\($/iu.test(normalized) ||
    /^result\s*\($/iu.test(normalized);
}

function findPreviousNonBlankLineIndex(lines: readonly string[], startIndex: number): number {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (lines[index].trim().length > 0) {
      return index;
    }
  }

  return -1;
}

function removeTrailingComma(line: string): string {
  return line.replace(/,([ \t]*(?:\/\/.*|--.*)?)$/u, '$1');
}

function getLeadingWhitespace(line: string): string {
  return /^\s*/u.exec(line)?.[0] ?? '';
}
