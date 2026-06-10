import type { SqlDialect } from '../../dialects';
import type { DetectedSqlObject } from '../objectDetection';

export const METADATA_HEADER_START = '-- METADATA';
export const METADATA_HEADER_END = '-- METADATA END';
export const LEGACY_METADATA_HEADER_START = '-- SQLovely-Metadata-Start';
export const LEGACY_METADATA_HEADER_END = '-- SQLovely-Metadata-End';
export const DEFAULT_VERSION = '1.0';
export const MISSING_DESCRIPTION_PLACEHOLDER = '<TODO>';
export const MISSING_HISTORY_DESCRIPTION_PLACEHOLDER = '<TODO>';

export interface ExistingMetadataHeader {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly fields: ReadonlyMap<string, string>;
  readonly historyEntries: readonly string[];
  readonly indentation: string;
  readonly isLegacy: boolean;
}

export interface MetadataHeaderContext {
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

export interface MetadataHeaderInsertionTarget {
  readonly index: number;
  readonly indentation: string;
  readonly blankLineAfter: boolean;
}

export interface MetadataHeaderRemovalRange {
  readonly startIndex: number;
  readonly endIndex: number;
}

export interface VersionAndHistorySynchronizationResult {
  readonly version: string;
  readonly historyEntries: readonly string[];
}

export interface HistoryVersionNormalizationResult {
  readonly historyEntries: readonly string[];
  readonly lastVersion?: string;
  readonly originalLastVersion?: string;
  readonly changed: boolean;
}

export interface ParsedVersion {
  readonly text: string;
  readonly segments: readonly string[];
  readonly numbers: readonly number[];
}

export interface ParsedHistoryEntryVersion {
  readonly version: ParsedVersion;
}
