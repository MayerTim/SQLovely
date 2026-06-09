# SQL coverage matrix

SQLovely focuses on lexical highlighting and conservative editing support. The table below describes the intended coverage after the syntax audit.

| SQL area | Highlighting | Formatter v1 | Object detection / extras |
| --- | --- | --- | --- |
| Line comments `--`, `//` | yes | preserved | ignored during object detection |
| Block comments `/* ... */` | yes | preserved | ignored during object detection |
| Single-quoted strings | yes | preserved | ignored during object detection |
| Bracketed identifiers | yes | preserved | supported for MSSQL objects |
| Double-quoted identifiers | yes | preserved | supported for Watcom and MSSQL objects |
| Host variables `:name` and `?` | yes | preserved | not object-relevant |
| SQL Server variables `@name`, `@@name` | yes | preserved | supported for MSSQL surface |
| Numeric and hex literals | yes | preserved | not object-relevant |
| General DML | yes | conservative keyword casing | not object-relevant |
| General DDL | yes | conservative keyword casing | routines supported |
| Watcom routines | yes | basic indentation | procedure/function/trigger supported |
| Watcom control flow | yes | basic indentation | not object-relevant |
| Watcom handlers/exceptions | yes | keyword casing | not object-relevant |
| Transactions and savepoints | yes | keyword casing | not object-relevant |
| MSSQL batches with `GO` | yes | root-level keyword handling | not object-relevant |
| MSSQL routines | yes | rudimentary formatting | procedure/function/trigger supported |
| Metadata headers | comments highlighted | inserted/updated via extras | inserted before the routine `BEGIN` line |
| Line length | highlighted normally | not wrapped automatically | informational diagnostic, default limit 120 |
| Full SQL validation | no | no | no |
| Schema-aware IntelliSense | no | no | no |
| Dialect migration | no | no | no |

## Notes

A TextMate grammar highlights lexical patterns. It cannot guarantee that a SQL file is syntactically valid for a database engine. SQLovely therefore treats syntax highlighting, formatting, diagnostics and future semantic features as separate layers.

## Extras and formatting

`sqlovely.extras.applyWithFormatting` is enabled by default. When enabled, normal SQLovely formatting can also apply enabled extras such as metadata-header insertion or updates. Disable it to keep formatting limited to whitespace, indentation and keyword casing.

Metadata headers are placed directly before the first `BEGIN` line of the detected procedure, function or trigger.
