import type { DetectedSqlObject } from '../objectDetection';
import { findLooseLegacyMetadataHeader } from '../legacyMetadataHeader';
import {
  LEGACY_METADATA_HEADER_END,
  LEGACY_METADATA_HEADER_START,
  type ExistingMetadataHeader
} from './metadataHeaderModel';
import {
  findLineEnd,
  findLineStart,
  findMarkerLine,
  readLineIndentation,
  type MarkerLineMatch
} from './metadataText';

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

function parseMetadataFields(headerText: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
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
    const key = normalizeMetadataFieldKey(rawKey);
    const value = fieldMatch[2]?.trim() ?? '';

    if (key) {
      fields.set(key, value);
      currentKey = key;
      continue;
    }

    currentKey = undefined;
  }

  return fields;
}

function normalizeMetadataFieldKey(rawKey: string): string | undefined {
  const key = rawKey
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();

  if (/^(?:description|beschreibung)$/iu.test(key)) {
    return 'description';
  }

  if (/^(?:version|vers\.?|ver\.?)$/iu.test(key)) {
    return 'version';
  }

  if (/^(?:author|created by|erstellt von|erstellt durch|ersteller|angelegt von|angelegt durch)$/iu.test(key)) {
    return 'author';
  }

  if (/^(?:updated by|modified by|last updated by|geändert von|geändert durch|geaendert von|geaendert durch|geupdated von|geupdated durch|aktualisiert von|aktualisiert durch)$/iu.test(key)) {
    return 'updated by';
  }

  if (/^(?:created|created date|created on|created at|creation date|erstellt datum|erstellt am|erstellungsdatum|erstelldatum)$/iu.test(key)) {
    return 'created';
  }

  if (/^(?:updated|updated date|updated on|updated at|last updated|modified|modified date|modified on|modified at|letzte änderung|letzte aenderung|geändert|geändert am|geändert datum|geaendert|geaendert am|geaendert datum|geupdated|geupdated am|geupdated datum|aktualisiert|aktualisiert am)$/iu.test(key)) {
    return 'updated';
  }

  return undefined;
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
