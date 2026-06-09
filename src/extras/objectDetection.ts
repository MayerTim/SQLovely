import type { SqlDialect, SqlObjectType } from '../dialects';
import { maskSqlCommentsAndStrings } from './sqlTextMasking';

export interface DetectedSqlObject {
  readonly type: SqlObjectType;
  readonly name: string;
  readonly index: number;
}

export function detectPrimarySqlObject(text: string, dialect: SqlDialect): DetectedSqlObject | undefined {
  return detectSqlObjects(text, dialect)[0];
}

export function detectSqlObjects(text: string, dialect: SqlDialect): readonly DetectedSqlObject[] {
  const maskedText = maskSqlCommentsAndStrings(text);
  const candidates = [
    ...detectObjects(maskedText, dialect.objectPatterns.procedure, 'procedure'),
    ...detectObjects(maskedText, dialect.objectPatterns.function, 'function'),
    ...detectObjects(maskedText, dialect.objectPatterns.trigger, 'trigger')
  ];

  candidates.sort((left, right) => left.index - right.index || left.name.localeCompare(right.name));

  return candidates;
}

function detectObjects(
  text: string,
  pattern: RegExp,
  type: SqlObjectType
): readonly DetectedSqlObject[] {
  const objects: DetectedSqlObject[] = [];
  const searchablePattern = ensureGlobalSearchablePattern(pattern);
  let match: RegExpExecArray | null;

  while ((match = searchablePattern.exec(text)) !== null) {
    const rawName = match[1]?.trim();

    if (rawName) {
      objects.push({
        type,
        name: normalizeObjectName(rawName),
        index: match.index
      });
    }

    if (match[0].length === 0) {
      searchablePattern.lastIndex += 1;
    }
  }

  return objects;
}

function ensureGlobalSearchablePattern(pattern: RegExp): RegExp {
  const flagsWithoutGlobal = pattern.flags.replace('g', '');
  const flags = flagsWithoutGlobal.includes('g') ? flagsWithoutGlobal : `${flagsWithoutGlobal}g`;
  return new RegExp(pattern.source, flags);
}

function normalizeObjectName(rawName: string): string {
  return rawName
    .split('.')
    .map((part) => unwrapIdentifierPart(part.trim()))
    .join('.')
    .trim();
}

function unwrapIdentifierPart(part: string): string {
  if (part.startsWith('[') && part.endsWith(']')) {
    return part.slice(1, -1).replace(/]]/g, ']');
  }

  if (part.startsWith('"') && part.endsWith('"')) {
    return part.slice(1, -1).replace(/""/g, '"');
  }

  return part;
}
