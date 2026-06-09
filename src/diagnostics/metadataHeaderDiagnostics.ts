import type { SqlDialect } from '../dialects';
import { findExistingMetadataHeader } from '../extras/metadataHeader';
import { detectPrimarySqlObject, type DetectedSqlObject } from '../extras/objectDetection';

export const SQL_OVELY_DIAGNOSTIC_SOURCE = 'SQLovely';
export const MISSING_METADATA_HEADER_DIAGNOSTIC_CODE = 'sqlovely.missingMetadataHeader';

export interface MissingMetadataHeaderIssue {
  readonly code: typeof MISSING_METADATA_HEADER_DIAGNOSTIC_CODE;
  readonly message: string;
  readonly object: DetectedSqlObject;
  readonly startIndex: number;
  readonly endIndex: number;
}

export function findMissingMetadataHeaderIssue(
  text: string,
  dialect: SqlDialect
): MissingMetadataHeaderIssue | undefined {
  const object = detectPrimarySqlObject(text, dialect);

  if (!object) {
    return undefined;
  }

  if (findExistingMetadataHeader(text, object)) {
    return undefined;
  }

  return {
    code: MISSING_METADATA_HEADER_DIAGNOSTIC_CODE,
    message: `SQLovely metadata header is missing for ${object.type} ${object.name}.`,
    object,
    startIndex: object.index,
    endIndex: findDeclarationLineEnd(text, object.index)
  };
}

function findDeclarationLineEnd(text: string, startIndex: number): number {
  const lineEndIndex = text.indexOf('\n', startIndex);

  if (lineEndIndex < 0) {
    return Math.max(startIndex + 1, text.length);
  }

  return Math.max(startIndex + 1, lineEndIndex);
}
