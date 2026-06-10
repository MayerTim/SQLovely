import { normalizeMetadataDateLiterals } from '../metadataDate';
import {
  DEFAULT_VERSION,
  MISSING_HISTORY_DESCRIPTION_PLACEHOLDER,
  type HistoryVersionNormalizationResult,
  type ParsedHistoryEntryVersion,
  type ParsedVersion,
  type VersionAndHistorySynchronizationResult
} from './metadataHeaderModel';

export function synchronizeVersionAndHistory(context: {
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
