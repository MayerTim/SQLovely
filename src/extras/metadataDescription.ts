const DEFAULT_METADATA_HEADER_MAX_LINE_LENGTH = 120;
const MIN_METADATA_HEADER_MAX_LINE_LENGTH = 40;
const MAX_METADATA_HEADER_MAX_LINE_LENGTH = 300;
const MIN_DESCRIPTION_CONTENT_WIDTH = 16;

export const METADATA_DESCRIPTION_PREFIX = '-- Description : ';
export const METADATA_DESCRIPTION_CONTINUATION_PREFIX = '--               ';

export interface MetadataDescriptionFormatOptions {
  readonly indentation: string;
  readonly maxLineLength?: number;
}

export function formatMetadataDescriptionLines(
  description: string,
  options: MetadataDescriptionFormatOptions,
): readonly string[] {
  const manualLines = normalizeDescription(description).split(/\r\n|\r|\n/u);
  const lines: string[] = [];
  let isFirstOutputLine = true;

  for (const manualLine of manualLines) {
    const wrappedLines = wrapManualDescriptionLine(
      manualLine,
      getAvailableContentWidth(
        isFirstOutputLine ? METADATA_DESCRIPTION_PREFIX : METADATA_DESCRIPTION_CONTINUATION_PREFIX,
        options,
      ),
    );

    for (const wrappedLine of wrappedLines) {
      const prefix = isFirstOutputLine
        ? METADATA_DESCRIPTION_PREFIX
        : METADATA_DESCRIPTION_CONTINUATION_PREFIX;

      lines.push(`${prefix}${wrappedLine}`);
      isFirstOutputLine = false;
    }
  }

  if (lines.length === 0) {
    return [METADATA_DESCRIPTION_PREFIX];
  }

  return lines;
}

export function normalizeMetadataHeaderMaxLineLength(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(
      MIN_METADATA_HEADER_MAX_LINE_LENGTH,
      Math.min(MAX_METADATA_HEADER_MAX_LINE_LENGTH, Math.floor(value)),
    );
  }

  return DEFAULT_METADATA_HEADER_MAX_LINE_LENGTH;
}

function normalizeDescription(description: string): string {
  const normalizedDescription = description.replace(/\r\n|\r/gu, '\n').trim();
  return normalizedDescription.length > 0 ? normalizedDescription : '';
}

function wrapManualDescriptionLine(line: string, contentWidth: number): readonly string[] {
  const normalizedLine = line.trim();

  if (normalizedLine.length === 0) {
    return [''];
  }

  const words = normalizedLine.split(/\s+/u);
  const wrappedLines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const pendingLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;

    if (countCharacters(pendingLine) <= contentWidth) {
      currentLine = pendingLine;
      continue;
    }

    if (currentLine.length > 0) {
      wrappedLines.push(currentLine);
    }

    if (countCharacters(word) <= contentWidth) {
      currentLine = word;
      continue;
    }

    const chunks = splitLongWord(word, contentWidth);
    wrappedLines.push(...chunks.slice(0, -1));
    currentLine = chunks[chunks.length - 1] ?? '';
  }

  if (currentLine.length > 0) {
    wrappedLines.push(currentLine);
  }

  return wrappedLines.length > 0 ? wrappedLines : [''];
}

function splitLongWord(word: string, contentWidth: number): readonly string[] {
  const characters = Array.from(word);
  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += contentWidth) {
    chunks.push(characters.slice(index, index + contentWidth).join(''));
  }

  return chunks;
}

function getAvailableContentWidth(
  prefix: string,
  options: MetadataDescriptionFormatOptions,
): number {
  const maxLineLength = normalizeMetadataHeaderMaxLineLength(options.maxLineLength);
  const prefixLength = countCharacters(`${options.indentation}${prefix}`);
  return Math.max(MIN_DESCRIPTION_CONTENT_WIDTH, maxLineLength - prefixLength);
}

function countCharacters(value: string): number {
  return Array.from(value).length;
}
