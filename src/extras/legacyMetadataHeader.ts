import type { DetectedSqlObject } from './objectDetection';
import { maskSqlCommentsAndStrings } from './sqlTextMasking';

const MISSING_DESCRIPTION_PLACEHOLDER = '<TODO>';

export interface LooseLegacyMetadataHeader {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly fields: ReadonlyMap<string, string>;
  readonly historyEntries: readonly string[];
  readonly indentation: string;
}

interface TextLine {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly content: string;
}

interface LooseMetadataHeaderCandidate {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly headerText: string;
  readonly indentation: string;
}

interface ParsedLooseMetadataHeader {
  readonly fields: ReadonlyMap<string, string>;
  readonly historyEntries: readonly string[];
}

export function findLooseLegacyMetadataHeader(text: string, object: DetectedSqlObject): LooseLegacyMetadataHeader | undefined {
  const candidate = findLooseHeaderCandidateBetweenObjectAndBody(text, object)
    ?? findLooseHeaderCandidateBeforeObject(text, object);

  if (!candidate) {
    return undefined;
  }

  const parsedHeader = parseLooseLegacyMetadataHeader(candidate.headerText, object);

  if (!parsedHeader) {
    return undefined;
  }

  return {
    startIndex: candidate.startIndex,
    endIndex: candidate.endIndex,
    fields: parsedHeader.fields,
    historyEntries: parsedHeader.historyEntries,
    indentation: candidate.indentation
  };
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

function parseLooseLegacyMetadataHeader(
  headerText: string,
  object: DetectedSqlObject
): ParsedLooseMetadataHeader | undefined {
  const commentContents = headerText
    .split(/\r\n|\r|\n/u)
    .map((line) => readLegacyCommentContent(line))
    .filter(isString);
  const version = findLegacyVersion(commentContents);

  if (!version) {
    return undefined;
  }

  const fields = new Map<string, string>();
  const description = findLegacyDescription(commentContents, object);
  const author = findFirstLegacyFieldValue(commentContents, legacyAuthorPatterns());
  const updatedBy = findFirstLegacyFieldValue(commentContents, legacyUpdatedByPatterns());
  const created = findFirstLegacyFieldValue(commentContents, legacyCreatedDatePatterns());
  const updated = findFirstLegacyFieldValue(commentContents, legacyUpdatedDatePatterns());

  fields.set('version', version);

  if (description) {
    fields.set('description', description);
  }

  if (author) {
    fields.set('author', author);
  }

  if (updatedBy) {
    fields.set('updated by', updatedBy);
  }

  if (created) {
    fields.set('created', created);
  }

  if (updated) {
    fields.set('updated', updated);
  }

  return {
    fields,
    historyEntries: parseLooseLegacyHistoryEntries(commentContents)
  };
}

function findLegacyVersion(commentContents: readonly string[]): string | undefined {
  return findFirstLegacyFieldValue(commentContents, [
    /^\s*(?:version|vers\.?|ver\.?)[ \t]*[:=][ \t]*v?([0-9]+(?:[.,][0-9]+){0,3})\b/iu
  ])?.replace(/,/gu, '.');
}

function legacyAuthorPatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:author|created[ \t]+by|erstellt[ \t]+von|ersteller|angelegt[ \t]+von)[ \t]*[:=][ \t]*(.+?)(?=[ \t]{2,}[\p{L}][\p{L} \t]*(?:[:=])|$)/iu
  ];
}

function legacyUpdatedByPatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:updated[ \t]+by|last[ \t]+updated[ \t]+by|modified[ \t]+by|geändert[ \t]+von|geaendert[ \t]+von|geupdated[ \t]+von|aktualisiert[ \t]+von)[ \t]*[:=][ \t]*(.+?)(?=[ \t]{2,}[\p{L}][\p{L} \t]*(?:[:=])|$)/iu
  ];
}

function legacyCreatedDatePatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:created(?:[ \t]+(?:date|on|at))?|creation[ \t]+date|erstellt(?:[ \t]+(?:datum|am))?|erstellungsdatum|erstelldatum)[ \t]*[:=][ \t]*([^ \t]+)/iu
  ];
}

function legacyUpdatedDatePatterns(): readonly RegExp[] {
  return [
    /(?:^|\b)(?:updated(?:[ \t]+(?:date|on|at))?|last[ \t]+updated|modified(?:[ \t]+(?:date|on|at))?|letzte[ \t]+(?:änderung|aenderung)|geändert(?:[ \t]+(?:am|datum))?|geaendert(?:[ \t]+(?:am|datum))?|geupdated(?:[ \t]+(?:am|datum))?|aktualisiert(?:[ \t]+am)?)[ \t]*[:=][ \t]*([^ \t]+)/iu
  ];
}

function findFirstLegacyFieldValue(
  commentContents: readonly string[],
  patterns: readonly RegExp[]
): string | undefined {
  for (const content of commentContents) {
    const normalizedContent = normalizeLegacyContent(content);

    if (!normalizedContent || isLegacySeparatorContent(normalizedContent)) {
      continue;
    }

    for (const pattern of patterns) {
      const match = pattern.exec(normalizedContent);
      const value = match?.[1]?.trim();

      if (value) {
        return trimTrailingInlineLabel(value);
      }
    }
  }

  return undefined;
}

function trimTrailingInlineLabel(value: string): string {
  return value
    .replace(/[ \t]+(?:author|created[ \t]+by|erstellt[ \t]+von|ersteller|angelegt[ \t]+von|updated[ \t]+by|last[ \t]+updated[ \t]+by|modified[ \t]+by|geändert[ \t]+von|geaendert[ \t]+von|geupdated[ \t]+von|aktualisiert[ \t]+von|created(?:[ \t]+(?:date|on|at))?|creation[ \t]+date|erstellt(?:[ \t]+(?:datum|am))?|erstellungsdatum|erstelldatum|updated(?:[ \t]+(?:date|on|at))?|last[ \t]+updated|modified(?:[ \t]+(?:date|on|at))?|letzte[ \t]+(?:änderung|aenderung)|geändert(?:[ \t]+(?:am|datum))?|geaendert(?:[ \t]+(?:am|datum))?|geupdated(?:[ \t]+(?:am|datum))?|aktualisiert(?:[ \t]+am)?)[ \t]*[:=].*$/iu, '')
    .trim();
}

function findLegacyDescription(
  commentContents: readonly string[],
  object: DetectedSqlObject
): string | undefined {
  const labelledDescription = findFirstLegacyFieldValue(commentContents, [
    /^\s*(?:description|beschreibung)[ \t]*[:=][ \t]*(.+)$/iu
  ]);

  if (labelledDescription) {
    return labelledDescription;
  }

  const freeFormLines: string[] = [];

  for (const content of commentContents) {
    const normalizedContent = normalizeLegacyContent(content);

    if (!normalizedContent || isLegacySeparatorContent(normalizedContent)) {
      continue;
    }

    if (isLegacyDescriptionLabelOnly(normalizedContent) || isLegacyObjectTitleLine(normalizedContent, object)) {
      continue;
    }

    if (isLegacyMetadataFieldLine(normalizedContent) || isLegacyHistoryHeader(normalizedContent)) {
      break;
    }

    freeFormLines.push(normalizedContent);
  }

  return freeFormLines.length > 0 ? freeFormLines.join(' ') : undefined;
}

function parseLooseLegacyHistoryEntries(commentContents: readonly string[]): readonly string[] {
  const entries: string[] = [];
  let inHistory = false;

  for (const content of commentContents) {
    const normalizedContent = normalizeLegacyContent(content);

    if (!normalizedContent || isLegacySeparatorContent(normalizedContent)) {
      continue;
    }

    if (!inHistory) {
      if (isLegacyHistoryHeader(normalizedContent)) {
        inHistory = true;
      }

      continue;
    }

    if (isLegacyMetadataFieldLine(normalizedContent)) {
      break;
    }

    const entry = normalizeLooseHistoryEntry(normalizedContent);

    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function normalizeLooseHistoryEntry(value: string): string | undefined {
  const match = /^\s*v?([0-9]+(?:[.,][0-9]+){0,3})(?:\s*[:\-–—]\s*|\s+)(.*)$/iu.exec(value);

  if (!match) {
    return value.trim() ? `   ${value.trim()}` : undefined;
  }

  const version = match[1]?.replace(/,/gu, '.');
  const description = match[2]?.trim();

  if (!version) {
    return undefined;
  }

  return `   v${version}: ${description || MISSING_DESCRIPTION_PLACEHOLDER}`;
}

function isLegacyMetadataFieldLine(value: string): boolean {
  return /^(?:description|beschreibung|version|vers\.?|ver\.?|author|created(?:[ \t]+(?:date|on|at|by))?|creation[ \t]+date|updated(?:[ \t]+(?:date|on|at|by))?|last[ \t]+updated(?:[ \t]+by)?|modified(?:[ \t]+(?:date|on|at|by))?|erstellt(?:[ \t]+(?:datum|am|von))?|erstellungsdatum|erstelldatum|ersteller|angelegt[ \t]+von|letzte[ \t]+(?:änderung|aenderung)|geändert(?:[ \t]+(?:am|datum|von))?|geaendert(?:[ \t]+(?:am|datum|von))?|geupdated(?:[ \t]+(?:am|datum|von))?|aktualisiert(?:[ \t]+(?:am|von))?)[ \t]*[:=]/iu.test(value);
}

function isLegacyHistoryHeader(value: string): boolean {
  return /^(?:history|historie|verlauf|änderungen|aenderungen|changelog)[ \t]*:?$/iu.test(value);
}

function isLegacyDescriptionLabelOnly(value: string): boolean {
  return /^(?:description|beschreibung)[ \t]*:?$/iu.test(value);
}

function isLegacyObjectTitleLine(value: string, object: DetectedSqlObject): boolean {
  const comparableValue = normalizeComparableIdentifier(value);
  const objectNameParts = object.name.split('.');
  const objectName = normalizeComparableIdentifier(object.name);
  const objectShortName = normalizeComparableIdentifier(objectNameParts[objectNameParts.length - 1] ?? object.name);

  return comparableValue === objectName || comparableValue === objectShortName;
}

function normalizeComparableIdentifier(value: string): string {
  return value
    .replace(/^["\[]|["\]]$/gu, '')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

function normalizeLegacyContent(value: string): string {
  return value
    .replace(/[ \t]*\*\/[ \t]*$/u, '')
    .trim();
}

function isLegacySeparatorContent(value: string): boolean {
  const normalizedValue = value.trim();
  return normalizedValue.length >= 3 && /^[\-_/=*\s]+$/u.test(normalizedValue);
}

function isLegacyCommentLine(line: string): boolean {
  return readLegacyCommentContent(line) !== undefined;
}

function readLegacyCommentContent(line: string): string | undefined {
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


function readTextLines(text: string): readonly TextLine[] {
  const lines: TextLine[] = [];
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

function findLineIndexAtOrAfter(lines: readonly TextLine[], index: number): number {
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

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
