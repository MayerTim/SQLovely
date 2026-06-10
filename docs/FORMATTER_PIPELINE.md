# Formatter Pipeline Design

This document describes the internal SQLovely formatter pipeline. It is intended for maintainers who add, move or debug formatter rules.

The formatter is deliberately organized as a behavior-preserving pipeline rather than one large pass. Watcom SQL has several compact constructs that can be written on one physical line, and later indentation logic is much simpler when those constructs are normalized first.

## High-level flow

`formatSql` coordinates formatting in this order:

1. Split the source text into physical lines while preserving the original end-of-line style.
2. Create a shared `FormattingContext` with the active dialect, resolved options, safety decision, indentation string and cancellation helpers.
3. Run structural expansion through `createFormattingPipeline`.
4. Apply keyword casing and indentation to the expanded lines.
5. Run narrow cleanup passes for line-level fixes that depend on final indentation.
6. Rejoin the lines and restore the final newline policy.

The pipeline should keep this separation intact: structural passes may split or reshape SQL before indentation; cleanup passes should only repair narrow final-line shapes and should not introduce broad SQL structure changes.

## Structural pass order

Structural passes live under `src/formatter/passes/structural/` and run before indentation. The current Watcom pipeline order is:

1. `inlineIfFormatting` expands compact procedural `IF ... THEN ... END IF` blocks.
2. `unionAllFormatting` keeps `UNION ALL` on a stable physical line.
3. `cursorForFormatting` normalizes `FOR ... CURSOR FOR ... DO ... END FOR` loops.
4. `queryClauseFormatting` splits top-level query clauses and predicate continuations.
5. `exceptionFormatting` normalizes `EXCEPTION` / `WHEN ... THEN` handlers.
6. `ifExpressionFormatting` preserves scalar Watcom `IF ... THEN ... ELSE ... ENDIF` expressions.
7. `caseExpressionFormatting` normalizes `CASE ... WHEN ... THEN ... ELSE ... END` expressions.
8. `blockEndFormatting` splits stacked block endings such as `END IF END IF;`.
9. `parenthesisFormatting` splits multiline parenthesized argument, parameter and list shapes.

Pass order matters. For example, procedural IF expansion must happen before IF-expression preservation, query clause splitting must happen before indentation, and stacked block endings must be split before block-depth accounting.

## Indentation stage

`formatSql.ts` owns indentation because it has to combine several independent depth sources:

- procedural block depth (`BEGIN`, `IF`, `WHILE`, `FOR`, `LOOP`, `ELSE`, `END`, etc.)
- query continuation depth (`SELECT`, `INTO`, `ORDER BY`, `GROUP BY`, logical predicates)
- parenthesis continuation depth
- scalar `CASE` expression depth
- exception-handler branch depth

Do not add broad structural rewrites directly to the indentation loop. Add them as a structural pass first, then adjust indentation only when the new structure needs a new depth rule.

## Cleanup pass order

Cleanup passes live under `src/formatter/passes/cleanup/` and run after indentation. They intentionally handle narrow final-shape issues, such as:

- multiline `UPDATE ... SET` assignment continuations
- safe comma and arithmetic spacing outside strings/comments
- DDL/list closing-parenthesis alignment
- safe removal of trailing commas immediately before DDL/list closing parentheses

Cleanup passes should not perform large rewrites. If a rule needs to split SQL statements, track strings/comments across lines, or change block structure, it belongs in the structural pipeline instead.

## Safety and cancellation

Every formatter entry point creates a `FormattingContext`. Structural passes should use the context instead of creating independent safety decisions. The pipeline already applies `shouldRunExpensiveLineFormatting` so expensive passes are skipped for very large documents or very long physical lines.

Formatter code should preserve these invariants:

- cancellation returns the original text unchanged
- large-document guards skip expensive rewrites but keep lightweight cleanup active
- long-line guards avoid complex line-level transformations
- scanner state remains valid even when a pass is skipped

## Adding a formatter rule

Use this checklist for new rules:

1. Decide whether the rule is structural or cleanup-only.
2. Add the rule to the appropriate `passes/structural` or `passes/cleanup` folder.
3. Keep scanning lexical and linear; do not use broad regular expressions across whole documents when a line scanner is enough.
4. Preserve strings, quoted identifiers and comments.
5. Thread any cross-line state through a small explicit state object.
6. Add focused regression tests under `test/formatter/`.
7. Update this document if the pass order or formatter invariants change.

When in doubt, prefer a small pass with one responsibility over adding more conditional logic to `formatSql.ts`.
