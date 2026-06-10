export const MISSING_DESCRIPTION_PLACEHOLDER = '<TODO>';

export interface LooseLegacyMetadataHeader {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly fields: ReadonlyMap<string, string>;
  readonly historyEntries: readonly string[];
  readonly indentation: string;
}

export interface LegacyTextLine {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly content: string;
}

export interface LooseMetadataHeaderCandidate {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly headerText: string;
  readonly indentation: string;
}

export interface ParsedLooseMetadataHeader {
  readonly fields: ReadonlyMap<string, string>;
  readonly historyEntries: readonly string[];
}
