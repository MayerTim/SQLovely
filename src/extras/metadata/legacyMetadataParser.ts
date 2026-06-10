import type { DetectedSqlObject } from '../objectDetection';
import { maskSqlCommentsAndStrings } from '../sqlTextMasking';
import type { LegacyTextLine, LooseMetadataHeaderCandidate } from './legacyMetadataModel';

export function findLooseHeaderCandidate(text: string, object: DetectedSqlObject): LooseMetadataHeaderCandidate | undefined {
  return findLooseHeaderCandidateBetweenObjectAndBody(text, object)
    ?? findLooseHeaderCandidateBeforeObject(text, object);
}

function findLooseHeaderCandidateBetweenObjectAndBody(
  text: string,
  object: DetectedSqlObject
): LooseMetadataHeaderCandidate | undefined {
  const maskedText = maskSqlCommentsAndStrings(text);
  const beginMatch = findBeginTokenAfterObject(maskedText, object.index);

  if (!beginMatch) {
    return undefined;
  }

  const beginLineStart = findLineStart(text, beginMatch.index);
  const candidate = findLooseHeaderCandidateBeforeIndex(text, beginLineStart);

  if (!candidate || candidate.startIndex <= object.index) {
    return undefined;
  }

  return candidate;
}

function findLooseHeaderCandidateBeforeObject(
  text: string,
  object: DetectedSqlObject
): LooseMetadataHeaderCandidate | undefined {
  return findLooseHeaderCandidateBeforeIndex(text, findLineStart(text, object.index));
}

function findLooseHeaderCandidateBeforeIndex(text: string, index: number): LooseMetadataHeaderCandidate | undefined {
  const lines = readTextLines(text);
  const anchorLineIndex = findLineIndexAtOrAfter(lines, index);

  if (anchorLineIndex < 1) {
    return undefined;
  }

  let endLineIndex = anchorLineIndex - 1;

  while (endLineIndex >= 0 && isBlankLine(lines[endLineIndex]?.content ?? '')) {
    endLineIndex -= 1;
  }

  if (endLineIndex < 0 || !isLegacyCommentLine(lines[endLineIndex]?.content ?? '')) {
    return undefined;
  }

  let startLineIndex = endLineIndex;

  for (let lineIndex = endLineIndex; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex];

    if (!line) {
      break;
    }

    if (isBlankLine(line.content) || isLegacyCommentLine(line.content)) {
      startLineIndex = lineIndex;
      continue;
    }

    break;
  }

  while (startLineIndex <= endLineIndex && isBlankLine(lines[startLineIndex]?.content ?? '')) {
    startLineIndex += 1;
  }

  while (endLineIndex >= startLineIndex && isBlankLine(lines[endLineIndex]?.content ?? '')) {
    endLineIndex -= 1;
  }

  const startLine = lines[startLineIndex];
  const endLine = lines[endLineIndex];

  if (!startLine || !endLine) {
    return undefined;
  }

  return {
    startIndex: startLine.startIndex,
    endIndex: endLine.endIndex,
    headerText: text.slice(startLine.startIndex, endLine.endIndex),
    indentation: readLineIndentation(text, startLine.startIndex)
  };
}

export function normalizeLegacyContent(value: string): string {
  return value
    .replace(/[ \t]*\*\/[ \t]*$/u, '')
    .replace(/^\*+[ \t]?/u, '')
    .trim();
}

export function isLegacySeparatorContent(value: string): boolean {
  const normalizedValue = value.trim();
  return normalizedValue.length >= 3 && /^[\-_/=*\s]+$/u.test(normalizedValue);
}

export function readLegacyCommentContent(line: string): string | undefined {
  const lineCommentMatch = /^[ \t]*(?:--|\/\/)[ \t]?(.*)$/u.exec(line);

  if (lineCommentMatch) {
    return lineCommentMatch[1] ?? '';
  }

  const blockStartMatch = /^[ \t]*\/\*[ \t]?(.*)$/u.exec(line);

  if (blockStartMatch) {
    return blockStartMatch[1] ?? '';
  }

  const blockMiddleMatch = /^[ \t]*\*(?!\/)[ \t]?(.*)$/u.exec(line);

  if (blockMiddleMatch) {
    return blockMiddleMatch[1] ?? '';
  }

  if (/^[ \t]*\*\/[ \t]*$/u.test(line)) {
    return '';
  }

  const slashCommentMatch = /^[ \t]*\/(?![*/])[ \t]?(.*)$/u.exec(line);

  if (slashCommentMatch) {
    return slashCommentMatch[1] ?? '';
  }

  return undefined;
}

function isLegacyCommentLine(line: string): boolean {
  return readLegacyCommentContent(line) !== undefined;
}

function readTextLines(text: string): readonly LegacyTextLine[] {
  const lines: LegacyTextLine[] = [];
  let index = 0;

  while (index < text.length) {
    const startIndex = index;
    const endIndex = findLineEnd(text, startIndex);

    lines.push({
      startIndex,
      endIndex,
      content: text.slice(startIndex, endIndex)
    });

    if (endIndex >= text.length) {
      break;
    }

    if (text[endIndex] === '\r' && text[endIndex + 1] === '\n') {
      index = endIndex + 2;
    } else {
      index = endIndex + 1;
    }
  }

  return lines;
}

function findLineIndexAtOrAfter(lines: readonly LegacyTextLine[], index: number): number {
  const exactLineIndex = lines.findIndex((line) => line.startIndex <= index && line.endIndex >= index);

  if (exactLineIndex >= 0) {
    return exactLineIndex;
  }

  const nextLineIndex = lines.findIndex((line) => line.startIndex > index);

  if (nextLineIndex >= 0) {
    return nextLineIndex;
  }

  return lines.length;
}

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function findBeginTokenAfterObject(maskedText: string, objectIndex: number): RegExpExecArray | undefined {
  const pattern = /\bbegin\b/giu;
  pattern.lastIndex = objectIndex;
  const match = pattern.exec(maskedText);
  return match ?? undefined;
}

function findLineStart(text: string, index: number): number {
  const previousNewline = text.lastIndexOf('\n', Math.max(0, index - 1));
  return previousNewline < 0 ? 0 : previousNewline + 1;
}

function findLineEnd(text: string, index: number): number {
  const nextNewline = text.indexOf('\n', index);

  if (nextNewline < 0) {
    return text.length;
  }

  return text[nextNewline - 1] === '\r' ? nextNewline - 1 : nextNewline;
}

function readLineIndentation(text: string, lineStartIndex: number): string {
  const lineEndIndex = findLineEnd(text, lineStartIndex);
  const line = text.slice(lineStartIndex, lineEndIndex);
  const match = /^[ \t]*/u.exec(line);
  return match?.[0] ?? '';
}
