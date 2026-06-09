import type { SqlDialect } from '../dialects';
import { applyExtras, type SqlovelyExtrasResult } from '../extras';
import { getDefaultAuthorName } from '../utils/defaultAuthor';
import { formatSql, type FormatSqlResult } from './formatSql';
import type { FormatSqlOptions } from './options';

export interface FormatSqlDocumentOptions extends Partial<FormatSqlOptions> {
  readonly applyExtrasWithFormatting?: boolean;
  readonly metadataHeaderEnabled?: boolean;
  readonly author?: string;
}

export interface FormatSqlDocumentResult {
  readonly text: string;
  readonly changed: boolean;
  readonly formatting: FormatSqlResult;
  readonly extras?: SqlovelyExtrasResult;
}

export function formatSqlDocument(
  text: string,
  dialect: SqlDialect,
  options: FormatSqlDocumentOptions = {}
): FormatSqlDocumentResult {
  const formatting = formatSql(text, dialect, options);

  if (!options.applyExtrasWithFormatting) {
    return {
      text: formatting.text,
      changed: formatting.changed,
      formatting
    };
  }

  const extras = applyExtras(formatting.text, dialect, {
    author: options.author ?? getDefaultAuthorName(),
    metadataHeaderEnabled: options.metadataHeaderEnabled
  });

  return {
    text: extras.text,
    changed: formatting.changed || extras.changed,
    formatting,
    extras
  };
}
