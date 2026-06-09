# SQLovely

<p align="center">
  <img src="images/logo.png" alt="SQLovely logo" width="128" />
</p>

SQLovely is a VS Code extension for `.sql` files. It provides SQL highlighting, conservative formatting, metadata-header extras, diagnostics and quick fixes.

Watcom SQL is the default dialect. MSSQL support is available as a small secondary dialect surface, not as a complete T-SQL implementation.

## Install locally

Build the package:

```bash
npm install
npm run package:vsix
```

Install the resulting VSIX:

```bash
code --install-extension out/sqlovely-*.vsix
```

## Recommended workspace settings

```json
{
  "sqlovely.dialect": "watcom",
  "[sql]": {
    "editor.defaultFormatter": "tim-mayer.sqlovely"
  }
}
```

To let VS Code format SQL files automatically on save, enable format-on-save for the SQL language:

```json
{
  "[sql]": {
    "editor.defaultFormatter": "tim-mayer.sqlovely",
    "editor.formatOnSave": true
  }
}
```

SQLovely Extras are applied during SQLovely formatting by default. This lets **Format Document** and VS Code format-on-save also keep supported metadata headers up to date. Disable it if formatting should only touch whitespace, indentation and keyword casing:

```json
{
  "sqlovely.extras.applyWithFormatting": true
}
```

Extras can also run as a separate save participant. This is disabled by default because it can update files even when formatting is not requested:

```json
{
  "sqlovely.extras.applyOnSave": false
}
```

## Commands

- **SQLovely: Show Active Dialect**
- **SQLovely: Switch Dialect**
- **SQLovely: Format Current SQL File**
- **SQLovely: Format SQL Files in Directory**
- **SQLovely: Insert or Update Metadata Header**
- **SQLovely: Apply SQLovely Extras**

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

The TextMate grammar is a broad SQLovely grammar for `.sql` files. Dialect-specific behavior lives in the formatter, object detection, SQLovely Extras, diagnostics and quick fixes.

## Syntax highlighting

The grammar covers the SQL structures SQLovely needs for regular SQL work:

- `--`, `//` and `/* ... */` comments
- single-quoted strings with doubled apostrophe escaping
- binary/hex literals
- bracketed, double-quoted and backtick identifiers
- host variables, local variables, system variables and positional parameters
- numeric literals
- common SQL, Watcom SQL and SQL Server data types
- common built-in scalar, aggregate, date/time, XML and window functions
- DDL, DML, transaction and control-flow keywords
- procedure, function and trigger declarations
- common schema-object declarations
- `GO` batch separators for MSSQL-oriented files

The grammar is designed for highlighting. It is not a full SQL parser.

See `docs/SYNTAX_GRAMMAR.md` and `docs/SQL_COVERAGE.md` for the detailed coverage matrix.

## Formatter

The formatter is conservative and line-oriented. Its defaults follow a compact SQL style: upper-case keywords/functions, spaces for indentation, 2-space indentation, trimmed trailing whitespace and a final newline. It supports:

- keyword/function casing
- basic Watcom block indentation
- simple `BEGIN` / `END`, `IF` / `ELSE` / `ENDIF`, `CASE` and MSSQL `TRY` / `CATCH` indentation
- trailing whitespace removal
- limiting consecutive blank lines
- optional final newline enforcement

It does not rewrite query structure, split statements, align JOINs or convert between dialects.

Formatter settings:

```json
{
  "sqlovely.format.enabled": true,
  "sqlovely.format.keywordCase": "upper",
  "sqlovely.format.indentSize": 2,
  "sqlovely.format.insertSpaces": true,
  "sqlovely.format.maxConsecutiveBlankLines": 1,
  "sqlovely.format.ensureFinalNewline": true
}
```

### Format all SQL files in a directory

Use **SQLovely: Format SQL Files in Directory** to format multiple `.sql` files at once.

After running the command, select the directory that should be processed. SQLovely searches for `.sql` files recursively, asks for confirmation, and then applies the normal SQL formatter to each file.

This command intentionally formats only. SQLovely Extras are not applied by the directory formatter, even when `sqlovely.extras.applyWithFormatting` is enabled. This makes the command safer for larger batch formatting runs.

The command skips common local/build folders such as `.git`, `node_modules`, `out` and `dist`. Open files with unsaved changes are skipped so their editor state is not overwritten.

## SQLovely Extras

SQLovely Extras are optional features that can update SQL files beyond pure formatting. The current extra inserts or updates a metadata header for procedures, functions and triggers.

```sql
CREATE PROCEDURE dbo.my_proc()
-- METADATA
--
-- Description : <TODO>
-- Version     : 1.0
-- Author      : my-user
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

The header is inserted directly before the first `BEGIN` line of the detected procedure, function or trigger. Existing older SQLovely headers are moved to this layout when they are updated.

Repeated runs update the existing SQLovely block instead of duplicating it. Object detection ignores declarations inside comments and single-quoted strings.

Extra settings:

```json
{
  "sqlovely.extras.enabled": true,
  "sqlovely.extras.applyWithFormatting": true,
  "sqlovely.extras.applyOnSave": false,
  "sqlovely.extras.metadataHeader.enabled": true
}
```

## Diagnostics and quick fixes

SQLovely warns when a supported procedure, function or trigger has no SQLovely metadata header. The quick fix inserts the same idempotent header used by the command.

Diagnostics do not change files by themselves. In addition to missing metadata headers, SQLovely can show informational diagnostics for lines longer than the configured style limit.

```json
{
  "sqlovely.diagnostics.maxLineLength.enabled": true,
  "sqlovely.diagnostics.maxLineLength.limit": 120
}
```

## Documentation

- `docs/GETTING_STARTED.md`
- `docs/WORKSPACE_SETTINGS.md`
- `docs/SYNTAX_GRAMMAR.md`
- `docs/SQL_COVERAGE.md`
- `PACKAGING.md`

## Development

```bash
npm install
npm run check
npm test
npm run package:vsix
```

Run in an Extension Development Host with `F5` from VS Code.

## Current limits

- no IntelliSense
- no schema-aware analysis
- no full Watcom SQL parser
- no full T-SQL parser
- no automatic dialect migration
- one primary SQL object per file is assumed for metadata-header insertion

## License

MIT
