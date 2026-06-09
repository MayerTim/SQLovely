# Development

This document contains the development workflow for SQLovely.

For user-facing extension usage, see `README.md`.
For release packaging, see `PACKAGING.md`.

## Setup

Install dependencies:

```bash
npm install
```

For a clean install from the lockfile:

```bash
npm ci
```

## Validate

Run TypeScript checks:

```bash
npm run check
```

Run the test suite:

```bash
npm test
```

Build a VSIX package:

```bash
npm run package:vsix
```

The generated package is written to `out/`.

## Extension Development Host

Open the repository in VS Code and press `F5` to start an Extension Development Host.

Useful smoke tests:

- open a `.sql` file
- run **SQLovely: Show Active Dialect**
- run **SQLovely: Format Current SQL File**
- run **SQLovely: Format SQL Files in Directory**
- verify compact Watcom inline `IF ... THEN ... END IF` statements expand without leaking indentation
- run **SQLovely: Insert or Update Metadata Header**
- verify diagnostics and quick fixes
- verify metadata headers in a script with multiple procedures, functions or triggers
- verify loose legacy metadata headers are normalized only when they contain a recognizable version field
- verify long metadata descriptions are wrapped without removing manual line breaks

## Settings during development

A practical development workspace setup is:

```json
{
  "sqlovely.dialect": "watcom",
  "sqlovely.format.enabled": true,
  "sqlovely.format.keywordCase": "upper",
  "sqlovely.format.indentSize": 2,
  "sqlovely.format.insertSpaces": true,
  "sqlovely.extras.applyWithFormatting": true,
  "sqlovely.extras.applyOnSave": false,
  "[sql]": {
    "editor.defaultFormatter": "MayerTim.sqlovely"
  }
}
```

For MSSQL-oriented smoke tests:

```json
{
  "sqlovely.dialect": "mssql",
  "sqlovely.extras.applyWithFormatting": true,
  "sqlovely.extras.applyOnSave": false,
  "[sql]": {
    "editor.defaultFormatter": "MayerTim.sqlovely"
  }
}
```

## Directory formatting behavior

**SQLovely: Format SQL Files in Directory** uses the normal `sqlovely.format.*` settings.

It intentionally does not apply SQLovely Extras. Keep this behavior conservative because the command can touch many files at once.

## Metadata-header regression focus

When changing metadata-header behavior, add or update regression tests for:

- generated SQLovely headers
- loose legacy header normalization
- multi-object scripts
- version/history synchronization
- `Updated By` migration and preservation
- date normalization
- multiline description wrapping and manual line-break preservation
