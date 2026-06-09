import type { SqlDialect } from '../dialect';
import { watcomBuiltinFunctions } from './functions';
import { watcomKeywords } from './keywords';
import { watcomObjectPatterns } from './objectPatterns';

export const watcomDialect: SqlDialect = {
  id: 'watcom',
  displayName: 'Watcom SQL',
  description: 'Default dialect for .sql files.',
  keywords: watcomKeywords,
  builtinFunctions: watcomBuiltinFunctions,
  batchSeparators: new Set<string>(),
  objectPatterns: watcomObjectPatterns
};
