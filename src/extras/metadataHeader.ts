import type { SqlDialect } from '../dialects';
import { detectSqlObjects, type DetectedSqlObject } from './objectDetection';
import { normalizeMetadataHeaderMaxLineLength } from './metadataDescription';
import {
  METADATA_HEADER_END,
  METADATA_HEADER_START,
  type ExistingMetadataHeader,
  type MetadataHeaderRemovalRange
} from './metadata/metadataHeaderModel';
import { findExistingMetadataHeader } from './metadata/metadataHeaderParser';
import { getMetadataHeaderInsertionTarget } from './metadata/metadataHeaderPlacement';
import { buildMetadataHeader } from './metadata/metadataHeaderRenderer';
import {
  detectPreferredLineBreak,
  findLineEnd,
  replaceRange
} from './metadata/metadataText';

export { METADATA_HEADER_END, METADATA_HEADER_START };
export { findExistingMetadataHeader } from './metadata/metadataHeaderParser';

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

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
