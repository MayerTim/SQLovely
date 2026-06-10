export function replaceRange(
  text: string,
  startIndex: number,
  endIndex: number,
  replacement: string,
): string {
  return `${text.slice(0, startIndex)}${replacement}${text.slice(endIndex)}`;
}

export function detectPreferredLineBreak(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export interface MarkerLineMatch {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly indentation: string;
}

export function findMarkerLine(
  text: string,
  pattern: RegExp,
  startIndex: number,
): MarkerLineMatch | undefined {
  pattern.lastIndex = startIndex;
  const match = pattern.exec(text);

  if (!match || match.index === undefined) {
    return undefined;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    indentation: match[1] ?? '',
  };
}

export function findLineStart(text: string, index: number): number {
  const previousNewline = text.lastIndexOf('\n', Math.max(0, index - 1));
  return previousNewline < 0 ? 0 : previousNewline + 1;
}

export function findLineEnd(text: string, index: number): number {
  const nextNewline = text.indexOf('\n', index);

  if (nextNewline < 0) {
    return text.length;
  }

  return text[nextNewline - 1] === '\r' ? nextNewline - 1 : nextNewline;
}

export function findLineEndIncludingBreak(text: string, index: number): number {
  const nextNewline = text.indexOf('\n', index);

  if (nextNewline < 0) {
    return text.length;
  }

  return nextNewline + 1;
}

export function readLineIndentation(text: string, lineStartIndex: number): string {
  const lineEndIndex = findLineEnd(text, lineStartIndex);
  const line = text.slice(lineStartIndex, lineEndIndex);
  const match = /^[ \t]*/u.exec(line);
  return match?.[0] ?? '';
}
