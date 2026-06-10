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
| Watcom control flow | yes | basic indentation and compact inline IF normalization | not object-relevant |
| Watcom parentheses | yes | multiline parameters and nested calls outside strings/comments | not object-relevant |
| `UNION ALL` queries | yes | split before and after `UNION ALL` outside strings/comments | not object-relevant |
| Watcom handlers/exceptions | yes | keyword casing | not object-relevant |
| Transactions and savepoints | yes | keyword casing | not object-relevant |
| MSSQL batches with `GO` | yes | root-level keyword handling | not object-relevant |
| MSSQL routines | yes | rudimentary formatting | procedure/function/trigger supported |
| Metadata headers | section markers, field names, versions, dates, TODO placeholders, update authors and history entries | inserted/updated through extras | supported for every detected procedure/function/trigger in a script |

## Metadata-header behavior

SQLovely metadata headers are managed per detected procedure, function and trigger. The metadata extra scans the full document, scopes each existing header to its nearest SQL object, and inserts or updates the header directly before that object's body where possible.

Loose legacy metadata-style comments are normalized only when a recognizable version field is present. This keeps regular comments from being rewritten accidentally while still supporting common dashed, slash-style and simple block-comment legacy headers.

Metadata updates normalize supported date formats to `YYYY-MM-DD`, preserve and wrap multiline descriptions, add the `Updated By` field, and synchronize the `Version` field with the latest history entry. Version bumps are constrained to a single logical step, such as `1.0` to `1.1`, `1.0` to `2.0`, or `1.0.0` to `1.0.1`.

## Design boundaries

SQLovely normalizes compact Watcom `IF ... THEN ... END IF` control-flow statements into block form before indentation is applied so closed inline IF statements do not leak indentation into following statements or objects. Expression-style Watcom `IF ... THEN ... ELSE ... ENDIF` constructs are preserved as expressions instead of being rewritten as procedural blocks. The formatter also keeps `UNION ALL` on its own physical line and splits non-empty Watcom parentheses outside strings and comments onto separate indented lines for routine parameters and nested calls, while keeping empty calls such as `proc()` and simple type lengths such as `varchar(14)` inline.

SQLovely currently does not provide:

- complete SQL parsing
- schema-aware analysis
- IntelliSense
- validation of nested SQL blocks
- guaranteed parsing of every possible legacy metadata style
- dialect-exclusive error reporting
- automatic conversion between Watcom SQL and MSSQL
