# SQLovely

SQLovely adds practical SQL language support for `.sql` files in VS Code.

It is focused on Watcom SQL by default and also includes a small MSSQL-oriented dialect surface for projects that need basic SQL Server-style support.

## Features

- SQL syntax highlighting for regular `.sql` files, including quoted Watcom built-in calls
- Conservative SQL formatting
- Optional metadata-header extras for every detected procedure, function and trigger in a script
- Diagnostics and quick fixes for supported SQLovely rules
- Legacy metadata-header normalization with version/history synchronization
- Watcom SQL as the default dialect
- Basic MSSQL support for common T-SQL-style files

## Quick start

Open a `.sql` file and run commands from the VS Code Command Palette.

Recommended workspace setting:

```json
{
  "sqlovely.dialect": "watcom",
  "[sql]": {
    "editor.defaultFormatter": "MayerTim.sqlovely"
  }
}
```

To format SQL files automatically when saving:

```json
{
  "[sql]": {
    "editor.defaultFormatter": "MayerTim.sqlovely",
    "editor.formatOnSave": true
  }
}
```

## Commands

- **SQLovely: Show Active Dialect**
- **SQLovely: Switch Dialect**
- **SQLovely: Format Current SQL File**
- **SQLovely: Format SQL Files in Directory**
- **SQLovely: Insert or Update Metadata Header**
- **SQLovely: Apply SQLovely Extras**

## Formatting

SQLovely formats conservatively. It keeps SQL structure intact and focuses on readable, predictable cleanup:

- keyword and function casing
- basic block indentation
- compact Watcom `IF ... THEN ... END IF` control-flow normalization
- Watcom `IF ... THEN ... ELSE ... ENDIF` expression preservation, including split expression normalization
- `UNION ALL` normalization to its own physical line
- top-level Watcom query-clause line breaks for `SELECT`, `FROM`, `WHERE`, `JOIN`, `ON`, `GROUP BY`, `HAVING` and `ORDER BY`, including continuation indentation for multiline lists and predicate function calls
- Watcom cursor `FOR ... CURSOR FOR ... DO ... END FOR` indentation
- Watcom `CASE WHEN THEN ELSE END` expression line breaks and indentation
- Watcom `EXCEPTION` / `WHEN ... THEN` handler line breaks and indentation
- trailing whitespace removal
- limiting consecutive blank lines
- final newline handling
- performance safety guards that skip expensive Watcom rewrite passes for very large documents or very long lines

Apart from normalizing compact Watcom `IF ... THEN ... END IF` control-flow statements, preserving and normalizing expression-style `IF ... THEN ... ELSE ... ENDIF` constructs, keeping `UNION ALL` on its own line, splitting Watcom parenthesized argument/parameter lists across indented lines, placing top-level Watcom query clauses on stable physical lines with continuation indentation, indenting cursor `FOR ... DO` loops, formatting Watcom `CASE` expressions and aligning Watcom exception handlers, and splitting/counting stacked Watcom block endings before indentation, the formatter does not perform schema-aware rewrites or migrate SQL between dialects.


### Formatter safety guards

SQLovely includes safety guards for very large generated SQL files. When a document exceeds the configured safety limits, expensive Watcom rewrite passes such as query-clause splitting, parenthesis splitting, cursor-loop splitting, CASE formatting and compact IF expansion are skipped. Lightweight cleanup such as keyword casing, whitespace cleanup and indentation still runs.

Default limits:

```json
{
  "sqlovely.format.safety.enabled": true,
  "sqlovely.format.safety.maxComplexDocumentLength": 1000000,
  "sqlovely.format.safety.maxComplexDocumentLines": 5000,
  "sqlovely.format.safety.maxComplexLineLength": 5000
}
```

When a guard triggers, SQLovely writes a short note to the SQLovely output channel.

### Format one file

Use **SQLovely: Format Current SQL File** or VS Code's built-in **Format Document** command.

### Format a directory

Use **SQLovely: Format SQL Files in Directory** to format every `.sql` file inside a selected folder.

The command opens a folder picker, searches recursively for `.sql` files, asks for confirmation and then formats each file. It skips common local/build folders such as `.git`, `node_modules`, `out` and `dist`.

Directory formatting intentionally applies formatting only. SQLovely Extras are not applied during this command.

## SQLovely Extras

SQLovely Extras are optional file-updating features beyond pure formatting.

The current extra inserts or updates metadata headers for every detected procedure, function and trigger in a script. Generated metadata headers also receive dedicated syntax scopes so themes can distinguish the markers, field names, versions, dates, TODO placeholders, update authors and history entries:

```sql
CREATE PROCEDURE dbo.my_proc()
-- METADATA
--
-- Description : First line of the description
--               Manually kept second line, with automatic wrapping if the
--               configured line-length limit would be exceeded.
-- Version     : 1.0
-- Author      : my-user
-- Updated By  : my-user
-- Created     : 2026-06-09
-- Updated     : 2026-06-09
--
-- History     :
--   v1.0: Initial creation - 2026-06-09 my-user
--
-- METADATA END
BEGIN
  SELECT 1;
END;
```

Headers are inserted directly before each detected object's first `BEGIN` line. Repeated runs update existing SQLovely blocks instead of duplicating them.

When SQLovely finds a loose legacy metadata-style comment block for a detected object, it normalizes the block to the generated SQLovely format instead of adding a second header. Legacy detection supports common `--`, `//`, `/`, `//*` and simple block-comment styles, but stays conservative and requires a recognizable version field so regular explanatory comments are left in place. German legacy aliases such as `erstellt durch` and `geändert durch` are migrated into `Author` and `Updated By`.

Metadata updates also normalize date values to `YYYY-MM-DD`, including common two-digit legacy years using `00`-`49` as `2000`-`2049` and `50`-`99` as `1950`-`1999`. They preserve multiline descriptions, wrap long description lines to `sqlovely.diagnostics.maxLineLength.limit`, and keep manual description line breaks. `Version` is synchronized with the latest history entry: newer valid history entries update the field, version bumps add missing history entries, and invalid jumps are coerced to a one-step bump.

Extras are applied during normal SQLovely formatting by default:

```json
{
  "sqlovely.extras.applyWithFormatting": true
}
```

Disable this if formatting should only touch whitespace, indentation and keyword casing:

```json
{
  "sqlovely.extras.applyWithFormatting": false
}
```

Extras can also run as a separate save participant. This is disabled by default:

```json
{
  "sqlovely.extras.applyOnSave": false
}
```

## Dialects

The active dialect is configured with:

```json
{
  "sqlovely.dialect": "watcom"
}
```

Supported values:

- `watcom`: default dialect
- `mssql`: small secondary dialect surface

The syntax grammar is intentionally broad. It highlights regular built-in function calls and common quoted Watcom built-in calls such as `"isnull"(...)`, `"string"(...)`, `"date"(...)`, `"substr"(...)` and `"xmlelement"(...)` while still treating other double-quoted names as identifiers. Dialect-specific behavior is handled by formatting, object detection, extras, diagnostics and quick fixes.

## Diagnostics

SQLovely can show diagnostics for supported rules, such as:

- missing metadata headers for procedures, functions and triggers, including multi-object scripts
- SQL lines longer than the configured line-length limit

Diagnostics do not modify files by themselves. Quick fixes can apply supported changes when selected.

```json
{
  "sqlovely.diagnostics.enabled": true,
  "sqlovely.diagnostics.maxLineLength.limit": 120
}
```

## Documentation

- `docs/DEVELOPMENT.md`
- `docs/SQL_IMPLEMENTATION.md`
- `PACKAGING.md`

## Current limits

- no IntelliSense
- no schema-aware analysis
- no full Watcom SQL parser
- no full T-SQL parser
- no automatic dialect migration
- loose legacy metadata detection is best effort and intentionally conservative

## License

MIT
