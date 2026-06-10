# Formatter corpus fixtures

Corpus fixtures are representative SQL samples that document current formatter behavior.
Each fixture has an `.input.sql` file and a matching `.expected.sql` file.

The corpus runner checks two things for every fixture pair:

1. formatting the input produces the expected output
2. formatting the expected output leaves it unchanged

Use sanitized, public-safe SQL only. These fixtures are regression tests, not product roadmap notes.
