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

The grammar stays intentionally broad. Quoted built-in function matching is ordered before generic double-quoted identifier matching, so calls like `"isnull"(...)`, `"string"(...)` and `"xmlelement"(...)` receive function scopes without changing normal quoted object names. Dialect-specific behavior lives in:

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
| Quoted built-in calls | common Watcom built-ins followed by `(`, for example `"isnull"(...)`, `"date"(...)`, `"string"(...)`, `"substr"(...)` and `"xmlelement"(...)` |
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
| Quoted Watcom built-in calls | yes, when followed by `(` | preserved | not object-relevant |
| Host variables `:name` and `?` | yes | preserved | not object-relevant |
| SQL Server variables `@name`, `@@name` | yes | preserved | supported for MSSQL surface |
| Numeric and hex literals | yes | preserved | not object-relevant |
| General DML | yes | conservative keyword casing | not object-relevant |
| General DDL | yes | conservative keyword casing | routines supported |
| Watcom routines | yes | basic indentation | procedure/function/trigger supported |
| Watcom control flow | yes | basic indentation and compact inline IF normalization | not object-relevant |
| Watcom parentheses | yes | multiline parameters and nested calls outside strings/comments | not object-relevant |
| `UNION ALL` queries | yes | split before and after `UNION ALL` outside strings/comments | not object-relevant |
| Watcom query clauses | yes | split top-level `SELECT`/`FROM`/`WHERE`/`JOIN`/`ON`/`GROUP BY`/`HAVING`/`ORDER BY` clauses and logical predicates outside strings/comments/nested parentheses | not object-relevant |
| Watcom cursor loops | yes | split `FOR ... CURSOR FOR ... SELECT ... DO` into a cursor header, indented query and body-opening `DO` line | not object-relevant |
| Watcom CASE expressions | yes | split compact `CASE WHEN THEN ELSE END` expressions into stable expression lines with nested CASE indentation | not object-relevant |
| Watcom handlers/exceptions | yes | split compact `EXCEPTION WHEN ... THEN BEGIN` handlers into stable exception, handler and body lines while preserving `ON EXCEPTION RESUME` and exception declarations | not object-relevant |
| Transactions and savepoints | yes | keyword casing | not object-relevant |
| MSSQL batches with `GO` | yes | root-level keyword handling | not object-relevant |
| MSSQL routines | yes | rudimentary formatting | procedure/function/trigger supported |
| Metadata headers | section markers, field names, versions, dates, TODO placeholders, update authors and history entries | inserted/updated through extras | supported for every detected procedure/function/trigger in a script |

## Metadata-header behavior

SQLovely metadata headers are managed per detected procedure, function and trigger. The metadata extra scans the full document, scopes each existing header to its nearest SQL object, and inserts or updates the header directly before that object's body where possible.

Loose legacy metadata-style comments are normalized only when a recognizable version field is present. This keeps regular comments from being rewritten accidentally while still supporting common dashed, slash-style, `//*` and simple block-comment legacy headers. Legacy German author/updater aliases such as `erstellt durch` and `geändert durch` are mapped to the current `Author` and `Updated By` fields.

Metadata updates normalize supported date formats to `YYYY-MM-DD`, including two-digit legacy years with `00`-`49` mapped to `2000`-`2049` and `50`-`99` mapped to `1950`-`1999`. They preserve and wrap multiline descriptions, add the `Updated By` field, and synchronize the `Version` field with the latest history entry. Version bumps are constrained to a single logical step, such as `1.0` to `1.1`, `1.0` to `2.0`, or `1.0.0` to `1.0.1`.

## Design boundaries

SQLovely normalizes compact Watcom `IF ... THEN ... END IF` control-flow statements into block form before indentation is applied so closed inline IF statements do not leak indentation into following statements or objects. Expression-style Watcom `IF ... THEN ... ELSE ... ENDIF` constructs are preserved as expressions instead of being rewritten as procedural blocks. The formatter also keeps `UNION ALL` on its own physical line, splits non-empty Watcom parentheses outside strings and comments onto separate indented lines for routine parameters and nested calls, places top-level Watcom query clauses on stable physical lines, indents Watcom cursor `FOR ... CURSOR FOR ... DO ... END FOR` loops with a separate query section, formats compact Watcom `CASE WHEN THEN ELSE END` expressions without treating them as procedural blocks, and aligns Watcom `EXCEPTION` / `WHEN ... THEN` handler sections as block separators. Query-clause splitting tracks quoted identifiers, strings, comments and parenthesis depth so nested subqueries are not treated as outer clauses, while empty calls such as `proc()` and simple type lengths such as `varchar(14)` stay inline.

SQLovely currently does not provide:

- complete SQL parsing
- schema-aware analysis
- IntelliSense
- validation of nested SQL blocks
- guaranteed parsing of every possible legacy metadata style
- dialect-exclusive error reporting
- automatic conversion between Watcom SQL and MSSQL
