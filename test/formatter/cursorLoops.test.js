const {
  assert,
  runTest,
  formatSql,
  formatSqlDocument,
  formatSqlRangeText,
  watcomDialect,
  mssqlDialect,
  defaultOptions,
  readFixture
} = require('./helpers');

runTest('formats Watcom cursor FOR query loops with stable indentation', () => {
  const input = [
    'begin',
    'for "curs" as "ZimCurs" dynamic scroll cursor for select "id" from "items" where "active" = 1 and "id" > 0 do',
    'set "v" = "id";',
    'end for;',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  FOR "curs" AS "ZimCurs" DYNAMIC SCROLL CURSOR FOR',
    '    SELECT "id"',
    '    FROM "items"',
    '    WHERE "active" = 1',
    '      AND "id" > 0',
    '  DO',
    '    SET "v" = "id";',
    '  END FOR;',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('does not split cursor FOR markers inside strings or comments', () => {
  const input = [
    "select 'cursor for select do' as note -- cursor for select do",
    'for "c" as "C" dynamic scroll cursor for',
    'select "id" from "items" do',
    'leave',
    'end for;'
  ].join('\n');

  const expected = [
    "SELECT 'cursor for select do' AS note -- cursor for select do",
    'FOR "c" AS "C" DYNAMIC SCROLL CURSOR FOR',
    '  SELECT "id"',
    '  FROM "items"',
    'DO',
    '  LEAVE',
    'END FOR;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
