import { normalizeMetadataDateValue } from '../metadataDate';
import { formatMetadataDescriptionLines } from '../metadataDescription';
import {
  DEFAULT_VERSION,
  METADATA_HEADER_END,
  METADATA_HEADER_START,
  MISSING_DESCRIPTION_PLACEHOLDER,
  type MetadataHeaderContext,
} from './metadataHeaderModel';
import { synchronizeVersionAndHistory } from './metadataHistory';

export function buildMetadataHeader(context: MetadataHeaderContext): string {
  const createdDate = normalizeMetadataDateValue(
    readExistingField(context.existingFields, 'Created') ?? context.date,
  );
  const description =
    readExistingField(context.existingFields, 'Description') ?? MISSING_DESCRIPTION_PLACEHOLDER;
  const requestedVersion = readExistingField(context.existingFields, 'Version') ?? DEFAULT_VERSION;
  const author = readExistingField(context.existingFields, 'Author') ?? context.author;
  const updatedBy = readExistingField(context.existingFields, 'Updated By') ?? context.author;
  const rawHistoryEntries =
    context.existingHistoryEntries && context.existingHistoryEntries.length > 0
      ? context.existingHistoryEntries
      : [`   v${requestedVersion}: Initial creation - ${createdDate} ${author}`];
  const synchronized = synchronizeVersionAndHistory({
    version: requestedVersion,
    historyEntries: rawHistoryEntries,
    date: context.date,
    author: updatedBy,
  });
  const descriptionLines = formatMetadataDescriptionLines(description, {
    indentation: context.indentation,
    maxLineLength: context.maxLineLength,
  });
  const lines = [
    METADATA_HEADER_START,
    '--',
    ...descriptionLines,
    `-- Version     : ${synchronized.version}`,
    `-- Author      : ${author}`,
    `-- Updated By  : ${updatedBy}`,
    `-- Created     : ${createdDate}`,
    `-- Updated     : ${context.date}`,
    '--',
    '-- History     :',
    ...synchronized.historyEntries.map((entry) => `--${entry}`),
    '--',
    METADATA_HEADER_END,
  ];

  return lines.map((line) => `${context.indentation}${line}`).join(context.lineBreak);
}

function readExistingField(
  fields: ReadonlyMap<string, string> | undefined,
  key: string,
): string | undefined {
  const value = fields?.get(key.toLowerCase())?.trim();
  return value ? value : undefined;
}
