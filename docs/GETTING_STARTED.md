# Getting started

1. Open the SQLovely folder.
2. Run `npm install`.
3. Run `npm run package:vsix`.
4. Install the VSIX from `out/`.
5. Open a `.sql` file.
6. Confirm that the active dialect is `watcom` with **SQLovely: Show Active Dialect**.

Recommended starting settings:

```json
{
  "sqlovely.dialect": "watcom",
  "sqlovely.extras.applyWithFormatting": true,
  "[sql]": {
    "editor.defaultFormatter": "tim-mayer.sqlovely"
  }
}
```

SQLovely Extras are applied with SQLovely formatting by default. Set `sqlovely.extras.applyWithFormatting` to `false` if format operations should not update metadata headers.

## Metadata headers

SQLovely can insert or update a metadata header for procedures, functions and triggers. The header is placed directly before the first `BEGIN` line.


## Formatting multiple SQL files

Run **SQLovely: Format SQL Files in Directory** to format every `.sql` file inside a selected folder.

The command opens a folder picker, searches recursively for `.sql` files and asks for confirmation before writing changes. It uses SQLovely's formatter settings, but does not apply SQLovely Extras during the batch run.
