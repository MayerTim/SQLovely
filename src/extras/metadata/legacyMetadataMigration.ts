import type { DetectedSqlObject } from '../objectDetection';
import {
  isLegacyDescriptionLabelOnly,
  isLegacyHistoryHeader,
  isLegacyMetadataFieldLine,
  legacyAuthorPatterns,
  legacyCreatedDatePatterns,
  legacyUpdatedByPatterns,
  legacyUpdatedDatePatterns,
  legacyVersionPatterns,
  trimTrailingInlineLabel
} from './legacyMetadataAliases';
import { MISSING_DESCRIPTION_PLACEHOLDER, type ParsedLooseMetadataHeader } from './legacyMetadataModel';
import { isLegacySeparatorContent, normalizeLegacyContent, readLegacyCommentContent } from './legacyMetadataParser';

export function parseLooseLegacyMetadataHeader(
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
  return findFirstLegacyFieldValue(commentContents, legacyVersionPatterns())?.replace(/,/gu, '.');
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

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
