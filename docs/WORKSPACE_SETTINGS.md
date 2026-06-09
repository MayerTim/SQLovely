# Workspace settings

SQLovely settings can be defined globally, per workspace or per workspace folder. The examples below are intended as starting points.

## Conservative Watcom setup

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
    "editor.defaultFormatter": "tim-mayer.sqlovely"
  }
}
```

## Format on save

This uses VS Code's built-in format-on-save setting and SQLovely as the SQL formatter. Enabled SQLovely Extras are applied with formatting by default.

```json
{
  "sqlovely.dialect": "watcom",
  "sqlovely.format.keywordCase": "upper",
  "sqlovely.format.indentSize": 2,
  "sqlovely.format.insertSpaces": true,
  "sqlovely.extras.applyWithFormatting": true,
  "[sql]": {
    "editor.defaultFormatter": "tim-mayer.sqlovely",
    "editor.formatOnSave": true
  }
}
```

## MSSQL sandbox

The MSSQL dialect is intentionally rudimentary. Use it for early testing, not as a complete T-SQL implementation.

```json
{
  "sqlovely.dialect": "mssql",
  "sqlovely.extras.applyWithFormatting": true,
  "sqlovely.extras.applyOnSave": false,
  "[sql]": {
    "editor.defaultFormatter": "tim-mayer.sqlovely"
  }
}
```

## Formatting style

SQLovely's formatter defaults to a compact SQL style:

```json
{
  "sqlovely.format.keywordCase": "upper",
  "sqlovely.format.indentSize": 2,
  "sqlovely.format.insertSpaces": true,
  "sqlovely.format.maxConsecutiveBlankLines": 1,
  "sqlovely.format.ensureFinalNewline": true
}
```

## Extras with formatting

Enabled SQLovely Extras run with normal SQLovely formatting by default. This means **Format Document**, **SQLovely: Format Current SQL File** and VS Code format-on-save can also insert or update supported metadata headers.

```json
{
  "sqlovely.extras.applyWithFormatting": true
}
```

Set it to `false` to keep formatting limited to whitespace, indentation and keyword casing. The separate `sqlovely.extras.applyOnSave` setting remains disabled by default.

## Style diagnostics

SQLovely can report lines that exceed the configured line-length limit. The default limit is 120 characters.

```json
{
  "sqlovely.diagnostics.maxLineLength.enabled": true,
  "sqlovely.diagnostics.maxLineLength.limit": 120
}
```


## Directory formatting

**SQLovely: Format SQL Files in Directory** uses the same `sqlovely.format.*` settings as normal document formatting.

SQLovely Extras are intentionally not applied by the directory formatter. Use **SQLovely: Apply SQLovely Extras** or the dedicated Extras settings when metadata-header updates are desired.
