import type { SqlDialect } from '../dialects';
import { detectPrimarySqlObject, type DetectedSqlObject } from './objectDetection';
import { findLooseLegacyMetadataHeader } from './legacyMetadataHeader';
import { maskSqlCommentsAndStrings } from './sqlTextMasking';

export const METADATA_HEADER_START = '-- METADATA';
export const METADATA_HEADER_END = '-- METADATA END';

const LEGACY_METADATA_HEADER_START = '-- SQLovely-Metadata-Start';
const LEGACY_METADATA_HEADER_END = '-- SQLovely-Metadata-End';
const DEFAULT_VERSION = '1.0';
const MISSING_DESCRIPTION_PLACEHOLDER = '<TODO>';

export type MetadataHeaderAction = 'inserted' | 'updated' | 'unchanged' | 'skipped';

export interface MetadataHeaderOptions {
  readonly now?: Date;
  readonly author?: string;
}

export interface MetadataHeaderResult {
  readonly action: MetadataHeaderAction;
  readonly text: string;
  readonly object?: DetectedSqlObject;
  readonly reason?: string;
}

interface ExistingMetadataHeader {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly fields: ReadonlyMap<string, string>;
  readonly historyEntries: readonly string[];
  readonly indentation: string;
  readonly isLegacy: boolean;
}

interface MetadataHeaderContext {
  readonly object: DetectedSqlObject;
  readonly dialect: SqlDialect;
  readonly date: string;
  readonly author: string;
  readonly lineBreak: string;
  readonly indentation: string;
  readonly existingFields?: ReadonlyMap<string, string>;
  readonly existingHistoryEntries?: readonly string[];
}

interface MetadataHeaderInsertionTarget {
  readonly index: number;
  readonly indentation: string;
  readonly blankLineAfter: boolean;
}

export function insertOrUpdateMetadataHeader(
  text: string,
  dialect: SqlDialect,
  options: MetadataHeaderOptions = {}
): MetadataHeaderResult {
  const initialObject = detectPrimarySqlObject(text, dialect);

  if (!initialObject) {
    return {
      action: 'skipped',
      text,
      reason: 'No supported SQL object declaration was found.'
    };
  }

  const existingHeader = findExistingMetadataHeader(text, initialObject);
  const lineBreak = detectPreferredLineBreak(text);
  const workingText = existingHeader
    ? removeExistingHeader(text, existingHeader, lineBreak)
    : text;
  const object = detectPrimarySqlObject(workingText, dialect) ?? initialObject;
  const insertionTarget = getMetadataHeaderInsertionTarget(workingText, object);
  const newHeader = buildMetadataHeader({
    object,
    dialect,
    date: formatDate(options.now ?? new Date()),
    author: options.author?.trim() || 'Unknown',
    lineBreak,
    indentation: insertionTarget.indentation,
    existingFields: existingHeader?.fields,
    existingHistoryEntries: existingHeader?.historyEntries
  });
  const nextText = insertMetadataHeaderAt(workingText, insertionTarget.index, newHeader, lineBreak, insertionTarget.blankLineAfter);

  return {
    action: existingHeader ? (nextText === text ? 'unchanged' : 'updated') : 'inserted',
    text: nextText,
    object
  };
}

export function findExistingMetadataHeader(text: string, object?: DetectedSqlObject): ExistingMetadataHeader | undefined {
  return findModernMetadataHeader(text)
    ?? findLegacyMetadataHeader(text)
    ?? (object ? findLooseLegacyExistingMetadataHeader(text, object) : undefined);
}

function findLooseLegacyExistingMetadataHeader(text: string, object: DetectedSqlObject): ExistingMetadataHeader | undefined {
  const looseHeader = findLooseLegacyMetadataHeader(text, object);

  if (!looseHeader) {
    return undefined;
  }

  return {
    ...looseHeader,
    isLegacy: true
  };
}

function findModernMetadataHeader(text: string): ExistingMetadataHeader | undefined {
  const start = findMarkerLine(text, /^([ \t]*)--\s*METADATA\s*$/gmu, 0);

  if (!start) {
    return undefined;
  }

  const end = findMarkerLine(text, /^([ \t]*)--\s*METADATA END\s*$/gmu, start.endIndex);

  if (!end) {
    return undefined;
  }

  const endIndex = findLineEnd(text, end.startIndex);
  const headerText = text.slice(start.startIndex, endIndex);

  return {
    startIndex: start.startIndex,
    endIndex,
    fields: parseMetadataFields(headerText),
    historyEntries: parseHistoryEntries(headerText),
    indentation: start.indentation,
    isLegacy: false
  };
}

function findLegacyMetadataHeader(text: string): ExistingMetadataHeader | undefined {
  const startIndex = text.indexOf(LEGACY_METADATA_HEADER_START);

  if (startIndex < 0) {
    return undefined;
  }

  const endMarkerIndex = text.indexOf(LEGACY_METADATA_HEADER_END, startIndex + LEGACY_METADATA_HEADER_START.length);

  if (endMarkerIndex < 0) {
    return undefined;
  }

  const startLineIndex = findLineStart(text, startIndex);
  const endIndex = findLineEnd(text, endMarkerIndex);
  const headerText = text.slice(startLineIndex, endIndex);

  return {
    startIndex: startLineIndex,
    endIndex,
    fields: parseMetadataFields(headerText),
    historyEntries: [],
    indentation: readLineIndentation(text, startLineIndex),
    isLegacy: true
  };
}

function buildMetadataHeader(context: MetadataHeaderContext): string {
  const createdDate = readExistingField(context.existingFields, 'Created') ?? context.date;
  const description = readExistingField(context.existingFields, 'Description') ?? MISSING_DESCRIPTION_PLACEHOLDER;
  const version = readExistingField(context.existingFields, 'Version') ?? DEFAULT_VERSION;
  const author = readExistingField(context.existingFields, 'Author') ?? context.author;
  const historyEntries = context.existingHistoryEntries && context.existingHistoryEntries.length > 0
    ? context.existingHistoryEntries
    : [`   v${version}: Initial creation - ${createdDate} ${author}`];
  const lines = [
    METADATA_HEADER_START,
    '--',
    `-- Description : ${description}`,
    `-- Version     : ${version}`,
    `-- Author      : ${author}`,
    `-- Created     : ${createdDate}`,
    `-- Updated     : ${context.date}`,
    '--',
    '-- History     :',
    ...historyEntries.map((entry) => `--${entry}`),
    '--',
    METADATA_HEADER_END
  ];

  return lines.map((line) => `${context.indentation}${line}`).join(context.lineBreak);
}

function parseMetadataFields(headerText: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  const supportedKeys = new Set(['description', 'version', 'author', 'created', 'updated']);
  const fieldPattern = /^[ \t]*--[ \t]*([^:\r\n]+?)[ \t]*:[ \t]*(.*)$/gmu;
  let match = fieldPattern.exec(headerText);

  while (match) {
    const rawKey = match[1]?.trim() ?? '';
    const key = rawKey.toLowerCase();
    const value = match[2]?.trim() ?? '';

    if (supportedKeys.has(key)) {
      fields.set(key, value);
    }

    match = fieldPattern.exec(headerText);
  }

  return fields;
}

function parseHistoryEntries(headerText: string): readonly string[] {
  const lines = headerText.split(/\r\n|\r|\n/u);
  const entries: string[] = [];
  let inHistory = false;

  for (const line of lines) {
    if (/^[ \t]*--[ \t]*History[ \t]*:/iu.test(line)) {
      inHistory = true;
      continue;
    }

    if (!inHistory) {
      continue;
    }

    if (/^[ \t]*--[ \t]*METADATA END[ \t]*$/iu.test(line) || /^[ \t]*--[ \t]*SQLovely-Metadata-End[ \t]*$/iu.test(line)) {
      break;
    }

    const commentMatch = /^[ \t]*--(.*)$/u.exec(line);

    if (!commentMatch) {
      continue;
    }

    const entry = commentMatch[1] ?? '';

    if (entry.trim().length > 0) {
      entries.push(entry);
    }
  }

  return entries;
}

function readExistingField(fields: ReadonlyMap<string, string> | undefined, key: string): string | undefined {
  const value = fields?.get(key.toLowerCase())?.trim();
  return value ? value : undefined;
}

function getMetadataHeaderInsertionTarget(
  text: string,
  object: DetectedSqlObject
): MetadataHeaderInsertionTarget {
  const maskedText = maskSqlCommentsAndStrings(text);
  const beginMatch = findBeginTokenAfterObject(maskedText, object.index);

  if (beginMatch) {
    const beginLineStart = findLineStart(text, beginMatch.index);

    return {
      index: beginLineStart,
      indentation: readLineIndentation(text, beginLineStart),
      blankLineAfter: false
    };
  }

  const declarationLineStart = findLineStart(text, object.index);

  return {
    index: findLineEndIncludingBreak(text, object.index),
    indentation: `${readLineIndentation(text, declarationLineStart)}  `,
    blankLineAfter: true
  };
}

function findBeginTokenAfterObject(maskedText: string, objectIndex: number): RegExpExecArray | undefined {
  const pattern = /\bbegin\b/giu;
  pattern.lastIndex = objectIndex;
  const match = pattern.exec(maskedText);
  return match ?? undefined;
}

function insertMetadataHeaderAt(
  text: string,
  index: number,
  header: string,
  lineBreak: string,
  blankLineAfter: boolean
): string {
  const needsLeadingLineBreak = index > 0 && !text.slice(0, index).endsWith('\n') && !text.slice(0, index).endsWith('\r');
  const leadingLineBreak = needsLeadingLineBreak ? lineBreak : '';
  const trailingSeparator = text.length === index
    ? lineBreak
    : blankLineAfter ? `${lineBreak}${lineBreak}` : lineBreak;

  return replaceRange(text, index, index, `${leadingLineBreak}${header}${trailingSeparator}`);
}

function removeExistingHeader(text: string, header: ExistingMetadataHeader, lineBreak: string): string {
  const removalEndIndex = expandRemovalEndIndex(text, header.endIndex);
  let nextText = replaceRange(text, header.startIndex, removalEndIndex, '');

  if (header.startIndex === 0 && nextText.startsWith(lineBreak)) {
    nextText = nextText.slice(lineBreak.length);
  }

  return nextText;
}

function expandRemovalEndIndex(text: string, endIndex: number): number {
  let index = endIndex;

  while (index < text.length && (text[index] === ' ' || text[index] === '\t')) {
    index += 1;
  }

  if (text[index] === '\r' && text[index + 1] === '\n') {
    index += 2;
  } else if (text[index] === '\n' || text[index] === '\r') {
    index += 1;
  }

  while (index < text.length) {
    const lineEnd = findLineEnd(text, index);
    const line = text.slice(index, lineEnd).trim();

    if (line.length > 0) {
      break;
    }

    index = lineEnd;

    if (text[index] === '\r' && text[index + 1] === '\n') {
      index += 2;
    } else if (text[index] === '\n' || text[index] === '\r') {
      index += 1;
    } else {
      break;
    }
  }

  return index;
}

function replaceRange(text: string, startIndex: number, endIndex: number, replacement: string): string {
  return `${text.slice(0, startIndex)}${replacement}${text.slice(endIndex)}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function detectPreferredLineBreak(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

interface MarkerLineMatch {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly indentation: string;
}

function findMarkerLine(text: string, pattern: RegExp, startIndex: number): MarkerLineMatch | undefined {
  pattern.lastIndex = startIndex;
  const match = pattern.exec(text);

  if (!match || match.index === undefined) {
    return undefined;
  }

  return {
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    indentation: match[1] ?? ''
  };
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

function findLineEndIncludingBreak(text: string, index: number): number {
  const nextNewline = text.indexOf('\n', index);

  if (nextNewline < 0) {
    return text.length;
  }

  return nextNewline + 1;
}

function readLineIndentation(text: string, lineStartIndex: number): string {
  const lineEndIndex = findLineEnd(text, lineStartIndex);
  const line = text.slice(lineStartIndex, lineEndIndex);
  const match = /^[ \t]*/u.exec(line);
  return match?.[0] ?? '';
}
