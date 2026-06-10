const {
  assert,
  runTest,
  formatSql,
  formatSqlDocument,
  formatSqlRangeText,
  watcomDialect,
  mssqlDialect,
  defaultOptions,
  readFixture,
} = require('./helpers');

runTest('formats compact Watcom CASE expressions without leaking indentation', () => {
  const input = [
    'begin',
    'set "v" = case when "a" = 1 then 1 when "a" = 2 then 2 else 0 end;',
    'select case when "a" = 1 then \'yes\' else \'no\' end as "flag" from "items" where "active" = 1 and "deleted" = 0;',
    'select 2;',
    'end;',
  ].join('\n');

  const expected = [
    'BEGIN',
    '  SET "v" = CASE',
    '    WHEN "a" = 1',
    '    THEN 1',
    '    WHEN "a" = 2',
    '    THEN 2',
    '    ELSE 0',
    '  END;',
    '  SELECT CASE',
    '    WHEN "a" = 1',
    "    THEN 'yes'",
    "    ELSE 'no'",
    '  END AS "flag"',
    '  FROM "items"',
    '  WHERE "active" = 1',
    '    AND "deleted" = 0;',
    '  SELECT 2;',
    'END;',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('preserves nested Watcom CASE expressions and ignores strings or comments', () => {
  const input = [
    "select 'case when then else end' as note -- case when comment",
    'begin',
    'set "v" = case when "a" = 1 then case when "b" = 1 then 2 else 3 end else 0 end;',
    'end;',
  ].join('\n');

  const expected = [
    "SELECT 'case when then else end' AS note -- case when comment",
    'BEGIN',
    '  SET "v" = CASE',
    '    WHEN "a" = 1',
    '    THEN CASE',
    '      WHEN "b" = 1',
    '      THEN 2',
    '      ELSE 3',
    '    END',
    '    ELSE 0',
    '  END;',
    'END;',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
