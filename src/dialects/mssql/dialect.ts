import type { SqlDialect } from '../dialect';
import { mssqlBuiltinFunctions } from './functions';
import { mssqlKeywords } from './keywords';
import { mssqlObjectPatterns } from './objectPatterns';

export const mssqlDialect: SqlDialect = {
  id: 'mssql',
  displayName: 'Microsoft SQL Server',
  description: 'Rudimentary secondary dialect surface for MSSQL-oriented files.',
  keywords: mssqlKeywords,
  builtinFunctions: mssqlBuiltinFunctions,
  batchSeparators: new Set<string>(['go']),
  objectPatterns: mssqlObjectPatterns,
};
