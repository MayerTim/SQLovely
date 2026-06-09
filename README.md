# SQLovely

SQLovely adds practical SQL language support for `.sql` files in VS Code.

It is focused on Watcom SQL by default and also includes a small MSSQL-oriented dialect surface for projects that need basic SQL Server-style support.

## Features

- SQL syntax highlighting for regular `.sql` files
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
- compact Watcom `IF ... THEN ... END IF` normalization
- trailing whitespace removal
- limiting consecutive blank lines
- final newline handling

Apart from normalizing compact Watcom `IF ... THEN ... END IF` control-flow statements and splitting Watcom parenthesized argument/parameter lists across indented lines, the formatter does not rewrite queries, align joins or migrate SQL between dialects.

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

When SQLovely finds a loose legacy metadata-style comment block for a detected object, it normalizes the block to the generated SQLovely format instead of adding a second header. Legacy detection supports common `--`, `//`, `/` and simple block-comment styles, but stays conservative and requires a recognizable version field so regular explanatory comments are left in place.

Metadata updates also normalize date values to `YYYY-MM-DD`, preserve multiline descriptions, wrap long description lines to `sqlovely.diagnostics.maxLineLength.limit`, and keep manual description line breaks. `Version` is synchronized with the latest history entry: newer valid history entries update the field, version bumps add missing history entries, and invalid jumps are coerced to a one-step bump.

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

The syntax grammar is intentionally broad. Dialect-specific behavior is handled by formatting, object detection, extras, diagnostics and quick fixes.

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
