import type { SqlDialect, SqlDialectId } from './dialect';
import { mssqlDialect } from './mssql/dialect';
import { watcomDialect } from './watcom/dialect';

export type { SqlDialect, SqlDialectId, SqlObjectPatterns, SqlObjectType } from './dialect';

export const DEFAULT_DIALECT_ID: SqlDialectId = 'watcom';

export const DIALECTS: Record<SqlDialectId, SqlDialect> = {
  watcom: watcomDialect,
  mssql: mssqlDialect
};

export const DIALECT_ORDER: readonly SqlDialectId[] = ['watcom', 'mssql'];

export function isSqlDialectId(value: unknown): value is SqlDialectId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DIALECTS, value);
}

export function getDialect(id: SqlDialectId): SqlDialect {
  return DIALECTS[id];
}
