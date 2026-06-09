export type SqlDialectId = 'watcom' | 'mssql';

export type SqlObjectType = 'procedure' | 'function' | 'trigger';

export interface SqlObjectPatterns {
  readonly procedure: RegExp;
  readonly function: RegExp;
  readonly trigger: RegExp;
}

export interface SqlDialect {
  readonly id: SqlDialectId;
  readonly displayName: string;
  readonly description: string;
  readonly keywords: ReadonlySet<string>;
  readonly builtinFunctions: ReadonlySet<string>;
  readonly batchSeparators: ReadonlySet<string>;
  readonly objectPatterns: SqlObjectPatterns;
}
