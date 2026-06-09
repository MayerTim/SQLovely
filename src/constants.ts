export const EXTENSION_NAME = 'SQLovely';
export const EXTENSION_ID = 'sqlovely';
export const SQL_LANGUAGE_ID = 'sql';
export const CONFIG_NAMESPACE = 'sqlovely';

export const COMMANDS = {
  showActiveDialect: 'sqlovely.showActiveDialect',
  switchDialect: 'sqlovely.switchDialect',
  formatCurrentFile: 'sqlovely.formatCurrentFile',
  formatSqlFilesInDirectory: 'sqlovely.formatSqlFilesInDirectory',
  insertOrUpdateMetadataHeader: 'sqlovely.insertOrUpdateMetadataHeader',
  applyExtras: 'sqlovely.applyExtras'
} as const;
