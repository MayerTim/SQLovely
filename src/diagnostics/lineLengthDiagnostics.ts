export const MAX_LINE_LENGTH_DIAGNOSTIC_CODE = 'sqlovely.maxLineLength';

export interface MaxLineLengthIssue {
  readonly code: typeof MAX_LINE_LENGTH_DIAGNOSTIC_CODE;
  readonly message: string;
  readonly line: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly length: number;
  readonly limit: number;
}

export function findMaxLineLengthIssues(text: string, limit: number): readonly MaxLineLengthIssue[] {
  const normalizedLimit = normalizeLimit(limit);
  const issues: MaxLineLengthIssue[] = [];
  let lineStartIndex = 0;
  let lineNumber = 0;

  for (let index = 0; index <= text.length; index += 1) {
    const isEndOfText = index === text.length;
    const isLineBreak = text[index] === '\n';

    if (!isEndOfText && !isLineBreak) {
      continue;
    }

    const rawLineEndIndex = isLineBreak && text[index - 1] === '\r' ? index - 1 : index;
    const lineText = text.slice(lineStartIndex, rawLineEndIndex);
    const length = Array.from(lineText).length;

    if (length > normalizedLimit) {
      issues.push({
        code: MAX_LINE_LENGTH_DIAGNOSTIC_CODE,
        message: `SQLovely style: line ${lineNumber + 1} is ${length} characters long; the configured limit is ${normalizedLimit}.`,
        line: lineNumber,
        startIndex: lineStartIndex,
        endIndex: rawLineEndIndex,
        length,
        limit: normalizedLimit
      });
    }

    lineStartIndex = index + 1;
    lineNumber += 1;
  }

  return issues;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 120;
  }

  return Math.max(40, Math.min(300, Math.floor(limit)));
}
