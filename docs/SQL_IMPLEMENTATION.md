# SQL implementation notes

This document describes SQLovely's current SQL-related implementation boundaries for maintainers.

SQLovely is built around a broad `.sql` TextMate grammar plus conservative, dialect-aware editing features. It is not a SQL parser and does not validate complete SQL programs.

## Dialects

The active dialect is configured with:

```json
{
  "sqlovely.dialect": "watcom"
}
```

Supported values:

- `watcom`: default dialect
- `mssql`: small secondary dialect surface for basic SQL Server-style workflows

The grammar stays intentionally broad. Dialect-specific behavior lives in:

- formatter rules
- object detection
- SQLovely Extras
- diagnostics
- quick fixes

## Syntax grammar

The grammar highlights useful lexical regions in `.sql` files.

| Area | Coverage |
| --- | --- |
| Comments | `--`, `//`, `/* ... */` |
| Strings | single-quoted strings, `N'...'`, doubled apostrophe escaping, hex/binary literals |
| Identifiers | bracketed identifiers, double-quoted identifiers, backtick identifiers, qualified object names |
| Variables | `@local`, `@@system`, `:host`, `?`, `$1`-style numbered parameters |
| Literals | decimal numbers, scientific notation, hexadecimal numbers, common language constants |
| DDL | common create/alter/drop statements and schema-object declarations |
| DML | select/insert/update/delete/merge/upsert and common query clauses |
| Watcom control flow | `IF`, `THEN`, `ELSEIF`, `ENDIF`, `LOOP`, `LEAVE`, `SIGNAL`, `RESIGNAL`, handlers and exceptions |
| Routines | procedure, proc, function and trigger declarations |
| Transactions | commit, rollback, savepoints and transaction blocks |
| MSSQL surface | `GO`, `CREATE OR ALTER`, `PROC`, variables and basic TRY/CATCH keywords |

## Coverage matrix

| SQL area | Highlighting | Formatter v1 | Object detection / extras |
| --- | --- | --- | --- |
| Line comments `--`, `//` | yes | preserved | ignored during object detection |
| Block comments `/* ... */` | yes | preserved | ignored during object detection |
| Single-quoted strings | yes | preserved | ignored during object detection |
| Bracketed identifiers | yes | preserved | supported for MSSQL objects |
| Double-quoted identifiers | yes | preserved | supported for Watcom and MSSQL objects |
| Host variables `:name` and `?` | yes | preserved | not object-relevant |
| SQL Server variables `@name`, `@@name` | yes | preserved | supported for MSSQL surface |
| Numeric and hex literals | yes | preserved | not object-relevant |
| General DML | yes | conservative keyword casing | not object-relevant |
| General DDL | yes | conservative keyword casing | routines supported |
| Watcom routines | yes | basic indentation | procedure/function/trigger supported |
| Watcom control flow | yes | basic indentation | not object-relevant |
| Watcom handlers/exceptions | yes | keyword casing | not object-relevant |
| Transactions and savepoints | yes | keyword casing | not object-relevant |
| MSSQL batches with `GO` | yes | root-level keyword handling | not object-relevant |
| MSSQL routines | yes | rudimentary formatting | procedure/function/trigger supported |
| Metadata headers | section markers, field names, versions, dates, TODO placeholders and history entries | inserted/updated through extras | supported for one primary object per file |

## Design boundaries

SQLovely currently does not provide:

- complete SQL parsing
- schema-aware analysis
- IntelliSense
- validation of nested SQL blocks
- dialect-exclusive error reporting
- automatic conversion between Watcom SQL and MSSQL
- multi-object metadata-header management within one file
