# Development

This document contains the development workflow for SQLovely.

For user-facing extension usage, see `README.md`.
For release packaging, see `PACKAGING.md`.
For formatter architecture details, see `docs/FORMATTER_PIPELINE.md`.

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

Run the full static validation workflow:

```bash
npm run check
```

This runs the TypeScript typecheck, ESLint and the Prettier formatting check. The checks can also be run individually:

```bash
npm run typecheck
npm run lint
npm run format:check
```

Format source files with Prettier:

```bash
npm run format
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
- verify Watcom parenthesized parameter lists and nested calls split without touching strings, comments or type lengths
- verify multiline `SELECT` / `INTO` / `ORDER BY` lists and predicate function arguments keep continuation indentation
- verify split `ORDER BY IF ... ENDIF` expression continuations keep the comma before the next sort key
- run **SQLovely: Insert or Update Metadata Header**
- verify diagnostics and quick fixes
- verify diagnostics update after a short edit debounce and stay responsive on large SQL files
- verify metadata headers in a script with multiple procedures, functions or triggers
- verify loose legacy metadata headers are normalized only when they contain a recognizable version field
- verify long metadata descriptions are wrapped without removing manual line breaks
- verify formatter safety guards skip expensive rewrites for generated/large SQL while keeping lightweight cleanup
- verify formatter smoke samples cover multiline `UPDATE ... SET` continuations, compact comma/operator spacing and temporary-table DDL parenthesis alignment
- verify multiline Watcom `ELSEIF` conditions align with the matching `IF` and do not leak indentation into following objects

## Settings during development

A practical development workspace setup is:

```json
{
  "sqlovely.dialect": "watcom",
  "sqlovely.format.enabled": true,
  "sqlovely.format.keywordCase": "upper",
  "sqlovely.format.indentSize": 2,
  "sqlovely.format.insertSpaces": true,
  "sqlovely.format.safety.enabled": true,
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

It intentionally does not apply SQLovely Extras. Keep this behavior conservative because the command can touch many files at once. Directory formatting forwards VS Code cancellation requests into the formatter and uses the same safety guards as normal document formatting.

## Diagnostics performance behavior

SQLovely diagnostics run immediately when SQL documents are opened and when relevant configuration changes. Text-change diagnostics are debounced so large SQL files are not reparsed on every keystroke. Missing-metadata diagnostics reuse the formatter safety limits and are skipped for documents that exceed the complex-document thresholds; max-line-length diagnostics remain available because they are lightweight and line-oriented.

## Metadata-header regression focus

When changing metadata-header behavior, add or update regression tests for:

- generated SQLovely headers
- loose legacy header normalization
- multi-object scripts
- version/history synchronization
- `Updated By` migration and preservation, including legacy `durch` aliases
- date normalization, including two-digit legacy years
- multiline description wrapping and manual line-break preservation

## Metadata-header internals

Metadata-header behavior is split into small internal modules under `src/extras/metadata/`:

- `metadataHeaderParser.ts` locates current, legacy and loose legacy headers and parses fields/history entries.
- `metadataHeaderRenderer.ts` renders the current compact `-- METADATA` header layout.
- `metadataHistory.ts` synchronizes version and history entries.
- `metadataHeaderPlacement.ts` decides where headers are inserted relative to the detected SQL object.
- `metadataText.ts` owns shared text-range and line-boundary helpers.
- `legacyMetadataAliases.ts` owns loose legacy label aliases and field classifiers.
- `legacyMetadataParser.ts` finds loose legacy header candidates around SQL objects and normalizes comment text.
- `legacyMetadataMigration.ts` maps loose legacy fields and history entries to the modern metadata model.

Keep `src/extras/metadataHeader.ts` as the public orchestration entry point. New metadata behavior should usually live in the focused helper module that owns that concern, with regression coverage in the metadata test suites.

## Formatter test organization

Formatter regression coverage is grouped by topic under `test/formatter/`. Keep `test/runFormatterTests.js` as the stable entry point for `npm run test:formatter`, and add new formatter regressions to the closest topic suite instead of expanding the runner directly. Use `test/formatter/helpers.js` for shared formatter imports, dialects, default options and fixture loading.

## Formatter corpus tests

Formatter corpus tests live under `test/corpus/` and use input/expected SQL fixture pairs. They are intended for representative, public-safe SQL examples that should remain stable while the formatter internals evolve.

Run only the corpus suite with:

```bash
npm run test:corpus
```

The corpus runner discovers `*.input.sql` files, formats each input with the dialect selected by the first corpus directory name, and compares the output with the matching `*.expected.sql` file. It also formats each expected file again to verify idempotency:

```text
format(input) === expected
format(expected) === expected
```

The same checks run against synthetic CRLF variants of every fixture pair. This protects line-ending stability without storing CRLF fixture files in Git:

```text
format(CRLF input) === CRLF expected
format(CRLF expected) === CRLF expected
```

The runner rejects unpaired or unsupported corpus SQL files so ZIP overlay workflows cannot leave stale fixtures silently ignored. Corpus SQL files must be named as `*.input.sql` or `*.expected.sql` pairs.

When adding a fixture:

- use sanitized SQL that can safely live in the public repository
- keep examples focused on one representative SQL shape or safety boundary
- include both the input and expected output files
- preserve current behavior unless a behavior change was explicitly approved
- do not use corpus fixtures as private roadmap notes or product planning documents

Corpus fixtures document behavior on representative samples. They do not imply complete Watcom or MSSQL grammar coverage, and they should not be treated as a full parser conformance suite.

## Formatter behavior guarantees

SQLovely formatter tests aim to protect these practical guarantees:

- formatting should be deterministic for the same input, dialect and options
- expected corpus output should be idempotent
- strings, comments and quoted identifiers should not be corrupted by keyword-casing or layout rules
- large-file and cancellation safety guards should keep the extension responsive
- dialect-specific behavior should be covered by dialect-named tests or corpus directories

The formatter is intentionally conservative and does not claim full SQL grammar parsing. If a future change requires a behavior update, update the smallest relevant topic test or corpus fixture and make the behavior change explicit in the commit.

## Formatter pipeline internals

Watcom structural rewrites are coordinated through `src/formatter/formattingPipeline.ts`. Shared formatter inputs such as the active dialect, resolved options, indentation string, cancellation checks and safety decision live in `src/formatter/formattingContext.ts`. Indentation is isolated in `src/formatter/indentation/indentationEngine.ts`, which applies keyword casing, block depth, query continuation depth, parenthesis continuation depth and CASE/exception branch depth after structural expansion. Keep the pipeline order explicit and behavior-preserving: compact/control-flow expansion, query/cursor/exception/expression normalization, block-ending normalization and parenthesis splitting should run before the indentation engine and final cleanup passes. When adding a formatter rule, prefer a small stateful pipeline pass that consumes the shared formatting context instead of expanding formatter orchestration logic in `formatSql.ts`.

Formatter pass files are grouped by phase:

- `src/formatter/passes/structural/` contains rewrite passes that can split or reshape SQL lines before indentation.
- `src/formatter/passes/cleanup/` contains narrow line-level cleanup passes that run after indentation and should not introduce new structural SQL splits.

See `docs/FORMATTER_PIPELINE.md` for the full pass order, invariants and checklist for adding formatter rules.

## Formatter performance regression focus

When adding formatter passes, keep them lexical and linear where possible. Add or update tests for:

- large documents that exceed `sqlovely.format.safety.maxComplexDocumentLines`
- very long physical lines that exceed `sqlovely.format.safety.maxComplexLineLength`
- cancellation before formatting applies edits
- normal-sized files that should still receive the full Watcom formatting pipeline
