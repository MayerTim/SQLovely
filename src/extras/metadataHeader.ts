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
const MISSING_HISTORY_DESCRIPTION_PLACEHOLDER = '<TODO>';

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

interface VersionAndHistorySynchronizationResult {
  readonly version: string;
  readonly historyEntries: readonly string[];
}

interface HistoryVersionNormalizationResult {
  readonly historyEntries: readonly string[];
  readonly lastVersion?: string;
  readonly originalLastVersion?: string;
  readonly changed: boolean;
}

interface ParsedVersion {
  readonly text: string;
  readonly segments: readonly string[];
  readonly numbers: readonly number[];
}

interface ParsedHistoryEntryVersion {
  readonly version: ParsedVersion;
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
  const requestedVersion = readExistingField(context.existingFields, 'Version') ?? DEFAULT_VERSION;
  const author = readExistingField(context.existingFields, 'Author') ?? context.author;
  const rawHistoryEntries = context.existingHistoryEntries && context.existingHistoryEntries.length > 0
    ? context.existingHistoryEntries
    : [`   v${requestedVersion}: Initial creation - ${createdDate} ${author}`];
  const synchronized = synchronizeVersionAndHistory({
    version: requestedVersion,
    historyEntries: rawHistoryEntries,
    date: context.date,
    author
  });
  const lines = [
    METADATA_HEADER_START,
    '--',
    `-- Description : ${description}`,
    `-- Version     : ${synchronized.version}`,
    `-- Author      : ${author}`,
    `-- Created     : ${createdDate}`,
    `-- Updated     : ${context.date}`,
    '--',
    '-- History     :',
    ...synchronized.historyEntries.map((entry) => `--${entry}`),
    '--',
    METADATA_HEADER_END
  ];

  return lines.map((line) => `${context.indentation}${line}`).join(context.lineBreak);
}

function synchronizeVersionAndHistory(context: {
  readonly version: string;
  readonly historyEntries: readonly string[];
  readonly date: string;
  readonly author: string;
}): VersionAndHistorySynchronizationResult {
  const requestedVersion = parseVersion(context.version)?.text ?? DEFAULT_VERSION;
  const normalizedHistory = normalizeHistoryVersions(context.historyEntries);

  if (!normalizedHistory.lastVersion) {
    return {
      version: requestedVersion,
      historyEntries: [
        ...normalizedHistory.historyEntries,
        createHistoryEntry(requestedVersion, context.date, context.author)
      ]
    };
  }

  if (normalizedHistory.changed && versionsEqual(context.version, normalizedHistory.originalLastVersion ?? '')) {
    return {
      version: normalizedHistory.lastVersion,
      historyEntries: normalizedHistory.historyEntries
    };
  }

  if (versionsEqual(requestedVersion, normalizedHistory.lastVersion)) {
    return {
      version: normalizedHistory.lastVersion,
      historyEntries: normalizedHistory.historyEntries
    };
  }

  if (isVersionGreaterThan(requestedVersion, normalizedHistory.lastVersion)) {
    const nextVersion = coerceNextVersion(normalizedHistory.lastVersion, requestedVersion);

    return {
      version: nextVersion,
      historyEntries: [
        ...normalizedHistory.historyEntries,
        createHistoryEntry(nextVersion, context.date, context.author)
      ]
    };
  }

  return {
    version: normalizedHistory.lastVersion,
    historyEntries: normalizedHistory.historyEntries
  };
}

function normalizeHistoryVersions(historyEntries: readonly string[]): HistoryVersionNormalizationResult {
  const normalizedEntries: string[] = [];
  let previousVersion: string | undefined;
  let originalLastVersion: string | undefined;
  let changed = false;

  for (const entry of historyEntries) {
    const parsedEntry = parseHistoryEntryVersion(entry);

    if (!parsedEntry) {
      normalizedEntries.push(entry);
      continue;
    }

    const originalVersion = parsedEntry.version.text;
    originalLastVersion = originalVersion;
    const normalizedVersion = previousVersion
      ? coerceNextVersion(previousVersion, originalVersion)
      : originalVersion;
    const normalizedEntry = normalizedVersion === originalVersion
      ? entry
      : replaceHistoryEntryVersion(entry, normalizedVersion);

    normalizedEntries.push(normalizedEntry);
    previousVersion = normalizedVersion;
    changed ||= normalizedEntry !== entry;
  }

  return {
    historyEntries: normalizedEntries,
    lastVersion: previousVersion,
    originalLastVersion,
    changed
  };
}

function parseHistoryEntryVersion(entry: string): ParsedHistoryEntryVersion | undefined {
  const match = /^\s*v?([0-9]+(?:[.,][0-9]+){0,3})(?:\s*[:\-–—]\s*|\s+)/iu.exec(entry);
  const version = match?.[1] ? parseVersion(match[1]) : undefined;

  return version ? { version } : undefined;
}

function replaceHistoryEntryVersion(entry: string, version: string): string {
  const match = /^(\s*)v?[0-9]+(?:[.,][0-9]+){0,3}(?:\s*[:\-–—]\s*|\s+)(.*)$/iu.exec(entry);

  if (!match) {
    return `   v${version}: ${MISSING_HISTORY_DESCRIPTION_PLACEHOLDER}`;
  }

  const indentation = match[1] ?? '';
  const description = match[2]?.trim() || MISSING_HISTORY_DESCRIPTION_PLACEHOLDER;

  return `${indentation}v${version}: ${description}`;
}

function createHistoryEntry(version: string, date: string, author: string): string {
  return `   v${version}: ${MISSING_HISTORY_DESCRIPTION_PLACEHOLDER} - ${date} ${author}`;
}

function coerceNextVersion(previousVersion: string, requestedVersion: string): string {
  const previous = parseVersion(previousVersion);
  const requested = parseVersion(requestedVersion);

  if (!previous || !requested) {
    return requested?.text ?? previous?.text ?? DEFAULT_VERSION;
  }

  if (isValidOneStepVersionBump(previous, requested)) {
    return requested.text;
  }

  const previousNumbers = normalizeVersionNumbers(previous, requested.numbers.length);
  const requestedNumbers = normalizeVersionNumbers(requested, requested.numbers.length);
  const targetNumbers = [...previousNumbers];
  const preferredBumpIndex = determinePreferredBumpIndex(previousNumbers, requestedNumbers, requested.numbers.length);

  targetNumbers[preferredBumpIndex] = (previousNumbers[preferredBumpIndex] ?? 0) + 1;

  for (let index = preferredBumpIndex + 1; index < targetNumbers.length; index += 1) {
    targetNumbers[index] = 0;
  }

  return formatVersionNumbers(targetNumbers, requested.segments);
}

function determinePreferredBumpIndex(
  previousNumbers: readonly number[],
  requestedNumbers: readonly number[],
  requestedSegmentCount: number
): number {
  if ((requestedNumbers[0] ?? 0) > (previousNumbers[0] ?? 0)) {
    return 0;
  }

  if (requestedSegmentCount >= 2 && (requestedNumbers[1] ?? 0) > (previousNumbers[1] ?? 0)) {
    return 1;
  }

  if (requestedSegmentCount >= 3) {
    return 2;
  }

  return Math.max(0, requestedSegmentCount - 1);
}

function isValidOneStepVersionBump(previous: ParsedVersion, requested: ParsedVersion): boolean {
  const segmentCount = Math.max(previous.numbers.length, requested.numbers.length);
  const previousNumbers = normalizeVersionNumbers(previous, segmentCount);
  const requestedNumbers = normalizeVersionNumbers(requested, segmentCount);

  for (let bumpIndex = 0; bumpIndex < segmentCount; bumpIndex += 1) {
    if ((requestedNumbers[bumpIndex] ?? 0) !== (previousNumbers[bumpIndex] ?? 0) + 1) {
      continue;
    }

    const prefixMatches = previousNumbers
      .slice(0, bumpIndex)
      .every((value, index) => value === requestedNumbers[index]);
    const suffixResets = requestedNumbers
      .slice(bumpIndex + 1)
      .every((value) => value === 0);

    if (prefixMatches && suffixResets) {
      return true;
    }
  }

  return false;
}

function parseVersion(value: string): ParsedVersion | undefined {
  const match = /^\s*v?([0-9]+(?:[.,][0-9]+){0,3})\s*$/iu.exec(value.trim());
  const rawVersion = match?.[1];

  if (!rawVersion) {
    return undefined;
  }

  const segments = rawVersion
    .replace(/,/gu, '.')
    .split('.');

  return {
    text: segments.join('.'),
    segments,
    numbers: segments.map((segment) => Number.parseInt(segment, 10))
  };
}

function versionsEqual(left: string, right: string): boolean {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    return false;
  }

  return compareVersions(parsedLeft, parsedRight) === 0;
}

function isVersionGreaterThan(left: string, right: string): boolean {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    return false;
  }

  return compareVersions(parsedLeft, parsedRight) > 0;
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const segmentCount = Math.max(left.numbers.length, right.numbers.length);
  const leftNumbers = normalizeVersionNumbers(left, segmentCount);
  const rightNumbers = normalizeVersionNumbers(right, segmentCount);

  for (let index = 0; index < segmentCount; index += 1) {
    const difference = (leftNumbers[index] ?? 0) - (rightNumbers[index] ?? 0);

    if (difference !== 0) {
      return Math.sign(difference);
    }
  }

  return 0;
}

function normalizeVersionNumbers(version: ParsedVersion, segmentCount: number): number[] {
  const numbers = [...version.numbers];

  while (numbers.length < segmentCount) {
    numbers.push(0);
  }

  return numbers;
}

function formatVersionNumbers(numbers: readonly number[], requestedSegments: readonly string[]): string {
  return numbers
    .slice(0, requestedSegments.length)
    .map((value, index) => formatVersionSegment(value, requestedSegments[index] ?? String(value)))
    .join('.');
}

function formatVersionSegment(value: number, requestedSegment: string): string {
  if (requestedSegment.length <= 1) {
    return String(value);
  }

  return String(value).padStart(requestedSegment.length, '0');
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
