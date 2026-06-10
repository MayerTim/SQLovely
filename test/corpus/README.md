# Formatter corpus fixtures

Corpus fixtures are representative SQL samples that document current formatter behavior.
Each fixture has an `.input.sql` file and a matching `.expected.sql` file.

The corpus runner checks four things for every fixture pair:

1. formatting the input produces the expected output
2. formatting the expected output leaves it unchanged
3. formatting a synthetic CRLF version of the input produces the CRLF expected output
4. formatting a synthetic CRLF version of the expected output leaves it unchanged

The runner also fails when corpus SQL files are not named as fixture pairs. Use only:

- `*.input.sql`
- `*.expected.sql`

Use sanitized, public-safe SQL only. These fixtures are regression tests, not product roadmap notes.
