# Changelog

## 0.1.7

- Added **SQLovely: Format SQL Files in Directory** to recursively format `.sql` files in a selected directory.
- Directory formatting runs without SQLovely Extras by default for safer batch formatting.
- Documented directory SQL formatting command usage.

## 0.1.6

- Changed generated metadata headers to the compact pre-`BEGIN` `-- METADATA` layout.
- Metadata headers are now inserted directly before the detected routine `BEGIN` line instead of at the top of the file.
- Existing legacy SQLovely metadata headers are migrated to the current pre-`BEGIN` layout.
- Added formatter settings for 2-space indentation defaults: `sqlovely.format.indentSize` and `sqlovely.format.insertSpaces`.
- Updated docs, examples and tests for the pre-`BEGIN` metadata header layout.

## 0.1.5

- Added `sqlovely.extras.applyWithFormatting`, enabled by default.
- SQLovely formatting can now apply enabled SQLovely Extras such as metadata-header insertion or updates.
- Updated documentation and example workspace settings for the new formatting/extras behavior.


## 0.1.4

- Renamed optional file-updating features to SQLovely Extras.
- Removed internal rollout/checklist documentation from the public docs.
- Updated settings, commands, examples and validation tests to use the `sqlovely.extras.*` namespace.
- Reworded public documentation to be suitable for an open source project.

## 0.1.3

- Added MIT licensing and public repository metadata.
- Expanded SQLovely grammar coverage for common SQL, Watcom SQL and rudimentary MSSQL syntax.
- Added a SQL coverage matrix for public project review.
- Added GitHub Actions validation workflow.
- Added public package metadata to the extension manifest.

## 0.1.2

- Reworked the SQLovely grammar with broader SQL and Watcom SQL highlighting coverage.
- Removed stale attribution markers and source-map output from packaged builds.
- Simplified project documentation and removed process-oriented notes.
- Simplified package contents for local distribution.

## 0.1.1

- Added a SQLovely-owned TextMate grammar.
- Added syntax grammar documentation.

## 0.1.0

- Added SQL language registration for `.sql` files.
- Added Watcom as the default dialect and MSSQL as a small secondary dialect surface.
- Added conservative formatting, metadata headers, diagnostics, quick fixes and VSIX packaging.
