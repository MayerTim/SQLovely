import type { SqlDialect } from '../dialects';
import { insertOrUpdateMetadataHeader, type MetadataHeaderOptions, type MetadataHeaderResult } from './metadataHeader';

export interface ApplySqlovelyExtrasOptions extends MetadataHeaderOptions {
  readonly metadataHeaderEnabled?: boolean;
}

export interface SqlovelyExtrasResult {
  readonly text: string;
  readonly metadataHeader: MetadataHeaderResult;
  readonly changed: boolean;
}

export function applyExtras(
  text: string,
  dialect: SqlDialect,
  options: ApplySqlovelyExtrasOptions = {}
): SqlovelyExtrasResult {
  const metadataHeader = options.metadataHeaderEnabled === false
    ? createSkippedMetadataHeaderResult(text, 'Metadata header extra is disabled.')
    : insertOrUpdateMetadataHeader(text, dialect, options);

  return {
    text: metadataHeader.text,
    metadataHeader,
    changed: metadataHeader.text !== text
  };
}

function createSkippedMetadataHeaderResult(text: string, reason: string): MetadataHeaderResult {
  return {
    action: 'skipped',
    text,
    reason
  };
}
