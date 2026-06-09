import type { SqlDialect } from '../dialects';
import { detectSqlObjects, type DetectedSqlObject } from './objectDetection';
import { findLooseLegacyMetadataHeader } from './legacyMetadataHeader';
import { maskSqlCommentsAndStrings } from './sqlTextMasking';
import { normalizeMetadataDateLiterals, normalizeMetadataDateValue } from './metadataDate';
import { formatMetadataDescriptionLines, normalizeMetadataHeaderMaxLineLength } from './metadataDescription';

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
  readonly maxLineLength?: number;
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
  readonly maxLineLength: number;
}

interface MetadataHeaderInsertionTarget {
  readonly index: number;
  readonly indentation: string;
  readonly blankLineAfter: boolean;
}

interface MetadataHeaderRemovalRange {
  readonly startIndex: number;
  readonly endIndex: number;
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
  let nextText = text;
  let action: MetadataHeaderAction = 'unchanged';
  let firstObject: DetectedSqlObject | undefined;
  let upperBound = nextText.length + 1;

  while (true) {
    const object = findLastUnprocessedObject(nextText, dialect, upperBound);

    if (!object) {
      break;
    }

    firstObject = object;

    const nextObject = findNextObjectAfter(nextText, dialect, object.index);
    const result = applyMetadataHeaderForObject(nextText, dialect, object, nextObject?.index ?? nextText.length, options);

    if (result.text !== nextText) {
      action = combineMetadataHeaderAction(action, result.action);
      nextText = result.text;
    }

    upperBound = result.nextUpperBound;
  }

  if (!firstObject) {
    return {
      action: 'skipped',
      text,
      reason: 'No supported SQL object declaration was found.'
    };
  }

  return {
    action: nextText === text ? 'unchanged' : action,
    text: nextText,
    object: firstObject
  };
}

interface SingleObjectMetadataHeaderResult {
  readonly action: MetadataHeaderAction;
  readonly text: string;
  readonly nextUpperBound: number;
}

function applyMetadataHeaderForObject(
  text: string,
  dialect: SqlDialect,
  object: DetectedSqlObject,
  nextObjectIndex: number,
  options: MetadataHeaderOptions
): SingleObjectMetadataHeaderResult {
  const existingHeader = findExistingMetadataHeader(text, object, nextObjectIndex);
  const lineBreak = detectPreferredLineBreak(text);
  const removalRange = existingHeader ? getExistingHeaderRemovalRange(text, existingHeader) : undefined;
  const workingText = removalRange
    ? replaceRange(text, removalRange.startIndex, removalRange.endIndex, '')
    : text;
  const objectIndexShift = removalRange && removalRange.startIndex < object.index
    ? removalRange.endIndex - removalRange.startIndex
    : 0;
  const adjustedObject = {
    ...object,
    index: object.index - objectIndexShift
  };
  const adjustedNextObjectIndex = nextObjectIndex - calculateRemovedCharactersBeforeIndex(removalRange, nextObjectIndex);
  const insertionTarget = getMetadataHeaderInsertionTarget(workingText, adjustedObject, adjustedNextObjectIndex);
  const newHeader = buildMetadataHeader({
    object: adjustedObject,
    dialect,
    date: formatDate(options.now ?? new Date()),
    author: options.author?.trim() || 'Unknown',
    lineBreak,
    indentation: insertionTarget.indentation,
    existingFields: existingHeader?.fields,
    existingHistoryEntries: existingHeader?.historyEntries,
    maxLineLength: normalizeMetadataHeaderMaxLineLength(options.maxLineLength)
  });
  const nextText = insertMetadataHeaderAt(workingText, insertionTarget.index, newHeader, lineBreak, insertionTarget.blankLineAfter);
  const nextUpperBound = Math.min(existingHeader?.startIndex ?? object.index, object.index);

  return {
    action: existingHeader ? (nextText === text ? 'unchanged' : 'updated') : 'inserted',
    text: nextText,
    nextUpperBound
  };
}

function findLastUnprocessedObject(
  text: string,
  dialect: SqlDialect,
  upperBound: number
): DetectedSqlObject | undefined {
  const objects = detectSqlObjects(text, dialect).filter((object) => object.index < upperBound);
  return objects[objects.length - 1];
}

function findNextObjectAfter(
  text: string,
  dialect: SqlDialect,
  objectIndex: number
): DetectedSqlObject | undefined {
  return detectSqlObjects(text, dialect).find((object) => object.index > objectIndex);
}

function combineMetadataHeaderAction(
  currentAction: MetadataHeaderAction,
  nextAction: MetadataHeaderAction
): MetadataHeaderAction {
  if (currentAction === 'inserted' || nextAction === 'inserted') {
    return 'inserted';
  }

  if (currentAction === 'updated' || nextAction === 'updated') {
    return 'updated';
  }

  return nextAction;
}

function calculateRemovedCharactersBeforeIndex(
  removalRange: MetadataHeaderRemovalRange | undefined,
  index: number
): number {
  if (!removalRange || removalRange.startIndex >= index) {
    return 0;
  }

  return Math.min(removalRange.endIndex, index) - removalRange.startIndex;
}

export function findExistingMetadataHeader(
  text: string,
  object?: DetectedSqlObject,
  nextObjectIndex = text.length
): ExistingMetadataHeader | undefined {
  if (!object) {
    return findModernMetadataHeaderInRange(text, 0, text.length)
      ?? findLegacyMetadataHeaderInRange(text, 0, text.length);
  }

  return findModernMetadataHeaderForObject(text, object, nextObjectIndex)
    ?? findLegacyMetadataHeaderForObject(text, object, nextObjectIndex)
    ?? findLooseLegacyExistingMetadataHeader(text, object);
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

function findModernMetadataHeaderForObject(
  text: string,
  object: DetectedSqlObject,
  nextObjectIndex: number
): ExistingMetadataHeader | undefined {
  return findModernMetadataHeaderInRange(text, object.index, nextObjectIndex);
}

function findModernMetadataHeaderInRange(
  text: string,
  startIndex: number,
  endIndex: number
): ExistingMetadataHeader | undefined {
  const start = findMarkerLine(text, /^([ \t]*)--\s*METADATA\s*$/gmu, startIndex);

  if (!start || start.startIndex >= endIndex) {
    return undefined;
  }

  const end = findMarkerLine(text, /^([ \t]*)--\s*METADATA END\s*$/gmu, start.endIndex);

  if (!end || end.startIndex >= endIndex) {
    return undefined;
  }

  return createModernMetadataHeader(text, start, end);
}

function createModernMetadataHeader(
  text: string,
  start: MarkerLineMatch,
  end: MarkerLineMatch
): ExistingMetadataHeader {
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

function findLegacyMetadataHeaderForObject(
  text: string,
  object: DetectedSqlObject,
  nextObjectIndex: number
): ExistingMetadataHeader | undefined {
  return findLegacyMetadataHeaderInRange(text, object.index, nextObjectIndex)
    ?? findLegacyMetadataHeaderBeforeObject(text, object);
}

function findLegacyMetadataHeaderInRange(
  text: string,
  startIndex: number,
  endIndex: number
): ExistingMetadataHeader | undefined {
  const startIndexInRange = text.indexOf(LEGACY_METADATA_HEADER_START, startIndex);

  if (startIndexInRange < 0 || startIndexInRange >= endIndex) {
    return undefined;
  }

  return createLegacyMetadataHeaderFromMarker(text, startIndexInRange, endIndex);
}

function findLegacyMetadataHeaderBeforeObject(
  text: string,
  object: DetectedSqlObject
): ExistingMetadataHeader | undefined {
  let searchStartIndex = 0;
  let closestHeader: ExistingMetadataHeader | undefined;

  while (searchStartIndex < object.index) {
    const markerIndex = text.indexOf(LEGACY_METADATA_HEADER_START, searchStartIndex);

    if (markerIndex < 0 || markerIndex >= object.index) {
      break;
    }

    const header = createLegacyMetadataHeaderFromMarker(text, markerIndex, object.index);

    if (!header) {
      searchStartIndex = markerIndex + LEGACY_METADATA_HEADER_START.length;
      continue;
    }

    if (isHeaderImmediatelyBeforeObject(text, header, object)) {
      closestHeader = header;
    }

    searchStartIndex = Math.max(header.endIndex, markerIndex + LEGACY_METADATA_HEADER_START.length);
  }

  return closestHeader;
}

function createLegacyMetadataHeaderFromMarker(
  text: string,
  markerIndex: number,
  searchEndIndex: number
): ExistingMetadataHeader | undefined {
  const endMarkerIndex = text.indexOf(LEGACY_METADATA_HEADER_END, markerIndex + LEGACY_METADATA_HEADER_START.length);

  if (endMarkerIndex < 0 || endMarkerIndex >= searchEndIndex) {
    return undefined;
  }

  const startLineIndex = findLineStart(text, markerIndex);
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

function isHeaderImmediatelyBeforeObject(
  text: string,
  header: ExistingMetadataHeader,
  object: DetectedSqlObject
): boolean {
  const betweenText = text.slice(header.endIndex, findLineStart(text, object.index));
  return /^\s*$/u.test(betweenText);
}

function buildMetadataHeader(context: MetadataHeaderContext): string {
  const createdDate = normalizeMetadataDateValue(readExistingField(context.existingFields, 'Created') ?? context.date);
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
  const descriptionLines = formatMetadataDescriptionLines(description, {
    indentation: context.indentation,
    maxLineLength: context.maxLineLength
  });
  const lines = [
    METADATA_HEADER_START,
    '--',
    ...descriptionLines,
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
    const dateNormalizedEntry = normalizeMetadataDateLiterals(entry);
    const parsedEntry = parseHistoryEntryVersion(dateNormalizedEntry);

    if (!parsedEntry) {
      normalizedEntries.push(dateNormalizedEntry);
      changed ||= dateNormalizedEntry !== entry;
      continue;
    }

    const originalVersion = parsedEntry.version.text;
    originalLastVersion = originalVersion;
    const normalizedVersion = previousVersion
      ? coerceNextVersion(previousVersion, originalVersion)
      : originalVersion;
    const normalizedEntry = normalizedVersion === originalVersion
      ? dateNormalizedEntry
      : replaceHistoryEntryVersion(dateNormalizedEntry, normalizedVersion);

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
  let currentKey: string | undefined;

  for (const line of headerText.split(/\r\n|\r|\n/u)) {
    const descriptionContinuation = currentKey === 'description'
      ? parseDescriptionContinuationLine(line)
      : undefined;

    if (descriptionContinuation !== undefined) {
      fields.set('description', `${fields.get('description') ?? ''}\n${descriptionContinuation}`);
      continue;
    }

    const fieldMatch = /^[ \t]*--[ \t]*([^:\r\n]+?)[ \t]*:[ \t]*(.*)$/u.exec(line);

    if (!fieldMatch) {
      currentKey = undefined;
      continue;
    }

    const rawKey = fieldMatch[1]?.trim() ?? '';
    const key = rawKey.toLowerCase();
    const value = fieldMatch[2]?.trim() ?? '';

    if (supportedKeys.has(key)) {
      fields.set(key, value);
      currentKey = key;
      continue;
    }

    currentKey = undefined;
  }

  return fields;
}

function parseDescriptionContinuationLine(line: string): string | undefined {
  const match = /^[ \t]*--[ \t]{4,}(.*)$/u.exec(line);

  if (!match) {
    return undefined;
  }

  return (match[1] ?? '').trim();
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
  object: DetectedSqlObject,
  nextObjectIndex: number
): MetadataHeaderInsertionTarget {
  const maskedText = maskSqlCommentsAndStrings(text);
  const beginMatch = findBeginTokenAfterObject(maskedText, object.index, nextObjectIndex);

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

function findBeginTokenAfterObject(
  maskedText: string,
  objectIndex: number,
  nextObjectIndex: number
): RegExpExecArray | undefined {
  const pattern = /\bbegin\b/giu;
  pattern.lastIndex = objectIndex;
  const match = pattern.exec(maskedText);

  if (!match || match.index >= nextObjectIndex) {
    return undefined;
  }

  return match;
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

function getExistingHeaderRemovalRange(text: string, header: ExistingMetadataHeader): MetadataHeaderRemovalRange {
  return {
    startIndex: header.startIndex,
    endIndex: expandRemovalEndIndex(text, header.endIndex)
  };
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
