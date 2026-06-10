import type { DetectedSqlObject } from './objectDetection';
import type { LooseLegacyMetadataHeader } from './metadata/legacyMetadataModel';
import { findLooseHeaderCandidate } from './metadata/legacyMetadataParser';
import { parseLooseLegacyMetadataHeader } from './metadata/legacyMetadataMigration';

export type { LooseLegacyMetadataHeader } from './metadata/legacyMetadataModel';

export function findLooseLegacyMetadataHeader(text: string, object: DetectedSqlObject): LooseLegacyMetadataHeader | undefined {
  const candidate = findLooseHeaderCandidate(text, object);

  if (!candidate) {
    return undefined;
  }

  const parsedHeader = parseLooseLegacyMetadataHeader(candidate.headerText, object);

  if (!parsedHeader) {
    return undefined;
  }

  return {
    startIndex: candidate.startIndex,
    endIndex: candidate.endIndex,
    fields: parsedHeader.fields,
    historyEntries: parsedHeader.historyEntries,
    indentation: candidate.indentation
  };
}
