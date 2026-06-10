import type { SqlObjectPatterns } from '../dialect';

const bracketedIdentifier = String.raw`\[(?:[^\]]|\]\])+\]`;
const quotedIdentifier = String.raw`"(?:[^"]|"")+"`;
const regularIdentifier = String.raw`(?:#|##)?[A-Za-z_][\w$#@]*`;
const identifierPart = String.raw`(?:${bracketedIdentifier}|${quotedIdentifier}|${regularIdentifier})`;
const multipartIdentifier = String.raw`${identifierPart}(?:\s*\.\s*${identifierPart}){0,3}`;
const createOrAlter = String.raw`(?:create\s+(?:or\s+alter\s+)?|alter\s+)`;

export const mssqlObjectPatterns: SqlObjectPatterns = {
  procedure: new RegExp(
    String.raw`\b${createOrAlter}(?:proc|procedure)\s+(${multipartIdentifier})`,
    'i',
  ),
  function: new RegExp(String.raw`\b${createOrAlter}function\s+(${multipartIdentifier})`, 'i'),
  trigger: new RegExp(String.raw`\b${createOrAlter}trigger\s+(${multipartIdentifier})`, 'i'),
};
