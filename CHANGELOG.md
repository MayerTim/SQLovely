# Changelog

## Unreleased

- Fixed split Watcom `IF ... THEN ... ELSE ... ENDIF` expressions so formatter output keeps them expression-style instead of treating `THEN` / `END IF` as procedural block indentation.
- Fixed Watcom formatter indentation state when one physical line contains multiple block openings or endings, so same-line `BEGIN ... END` and compact nested `IF ... END IF` statements do not leak indentation.
- Fixed Watcom formatter indentation after stacked block endings such as `END IF END IF;` and `END IF END IF END FOR;`.
- Added formatter safety guards for very large Watcom SQL documents and very long physical lines, with cancellation checks and output-channel notes when expensive rewrite passes are skipped.
- Added Watcom `EXCEPTION` / `WHEN ... THEN` handler formatting with stable indentation while preserving `ON EXCEPTION RESUME` and exception declarations.
- Added syntax highlighting for quoted Watcom built-in function calls such as `"isnull"(...)`, `"string"(...)`, `"date"(...)`, `"substr"(...)` and `"xmlelement"(...)`.
- Added Watcom `CASE WHEN THEN ELSE END` expression formatting with stable indentation and nested CASE support.
- Added Watcom cursor `FOR ... CURSOR FOR ... DO ... END FOR` formatting with stable query/body indentation.
- Added Watcom query-clause formatting for top-level `SELECT`, `FROM`, `WHERE`, `JOIN`, `ON`, `GROUP BY`, `HAVING` and `ORDER BY` clauses, including logical predicate continuations.
- Fixed Watcom formatter handling for expression-style `IF ... THEN ... ELSE ... ENDIF` constructs so they are not rewritten as procedural IF blocks.
- Added SQL formatter normalization that keeps `UNION ALL` on its own physical line.
- Fixed Watcom formatter indentation after compact inline `IF ... THEN ... END IF` statements by expanding them into stable block form.
- Added Watcom parenthesis formatting for parameters and nested calls outside strings/comments, with indentation for multiline argument lists.
- Added dedicated syntax scopes for generated metadata headers, including markers, fields, values, dates, TODO placeholders, update authors and history entries.
- Added normalization of loose legacy metadata-style comment headers to the current SQLovely metadata format.
- Added metadata-header processing for every detected procedure, function and trigger in multi-object SQL scripts.
- Added version/history synchronization so `Version` matches the latest history entry and invalid version jumps are coerced to one-step bumps.
- Added multiline metadata descriptions with automatic wrapping to the configured line-length limit while preserving manual line breaks.
- Added `Updated By` metadata support, including migration from legacy updated-by aliases such as `geändert von`, `geändert durch` and `geupdated von`.
- Normalized metadata date values and history dates to `YYYY-MM-DD`, including common day-first and year-first separators plus two-digit legacy years with a documented pivot rule.
- Expanded metadata regression coverage for legacy headers, multiline descriptions, date normalization, version synchronization and multi-object scripts.

## 0.1.7

- Consolidated developer documentation into `docs/DEVELOPMENT.md` and `docs/SQL_IMPLEMENTATION.md`.
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
