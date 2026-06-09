# SQLovely syntax grammar

The grammar is a TextMate grammar for highlighting `.sql` files. It is broad enough for daily Watcom SQL work and small MSSQL migration tests, but it is not a parser.

## Covered lexical areas

| Area | Coverage |
| --- | --- |
| Comments | `--`, `//`, `/* ... */` |
| Strings | single-quoted strings, `N'...'`, doubled apostrophe escaping, hex/binary literals |
| Identifiers | bracketed identifiers, double-quoted identifiers, backtick identifiers, qualified object names |
| Variables | `@local`, `@@system`, `:host`, `?`, `$1`-style numbered parameters |
| Literals | decimal numbers, scientific notation, hexadecimal numbers, common language constants |
| DDL | common create/alter/drop statements and schema-object declarations |
| DML | select/insert/update/delete/merge/upsert and common query clauses |
| Watcom control flow | `IF`, `THEN`, `ELSEIF`, `ENDIF`, `LOOP`, `LEAVE`, `SIGNAL`, `RESIGNAL`, handlers and exceptions |
| Routines | procedure, proc, function and trigger declarations |
| Transactions | commit, rollback, savepoints and transaction blocks |
| MSSQL surface | `GO`, `CREATE OR ALTER`, `PROC`, variables and basic TRY/CATCH keywords |

## Design boundaries

The grammar does not validate SQL. It highlights useful lexical regions and leaves semantic decisions to formatter, object detection, diagnostics and future analyzers.

Known boundaries:

- no complete statement grammar
- no schema awareness
- no validation of nested SQL blocks
- no dialect-exclusive error reporting
- no automatic conversion between Watcom SQL and MSSQL
