import type { SqlDialect, SqlObjectType } from '../dialects';
import { maskSqlCommentsAndStrings } from './sqlTextMasking';

export interface DetectedSqlObject {
  readonly type: SqlObjectType;
  readonly name: string;
  readonly index: number;
}

export function detectPrimarySqlObject(text: string, dialect: SqlDialect): DetectedSqlObject | undefined {
  const maskedText = maskSqlCommentsAndStrings(text);
  const candidates = [
    detectObject(maskedText, dialect.objectPatterns.procedure, 'procedure'),
    detectObject(maskedText, dialect.objectPatterns.function, 'function'),
    detectObject(maskedText, dialect.objectPatterns.trigger, 'trigger')
  ].filter(isDetectedSqlObject);

  candidates.sort((left, right) => left.index - right.index);

  return candidates[0];
}

function detectObject(
  text: string,
  pattern: RegExp,
  type: SqlObjectType
): DetectedSqlObject | undefined {
  const match = ensureSearchablePattern(pattern).exec(text);

  if (!match || match.index === undefined) {
    return undefined;
  }

  const rawName = match[1]?.trim();

  if (!rawName) {
    return undefined;
  }

  return {
    type,
    name: normalizeObjectName(rawName),
    index: match.index
  };
}

function ensureSearchablePattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.replace('g', '');
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

function isDetectedSqlObject(value: DetectedSqlObject | undefined): value is DetectedSqlObject {
  return value !== undefined;
}
