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

runTest('keeps UNION ALL on its own physical line', () => {
  const input = [
    'begin',
    'select 1 union all select 2;',
    'select 3 UNION ALL',
    'select 4;',
    'end;',
  ].join('\n');

  const expected = [
    'BEGIN',
    '  SELECT 1',
    '  UNION ALL',
    '  SELECT 2;',
    '  SELECT 3',
    '  UNION ALL',
    '  SELECT 4;',
    'END;',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('does not split UNION ALL inside strings or comments', () => {
  const input = [
    "select 'union all' as value -- union all comment",
    '/* union all inside block comment */',
    'select 1 union all select 2;',
  ].join('\n');

  const expected = [
    "SELECT 'union all' AS VALUE -- union all comment",
    '/* union all inside block comment */',
    'SELECT 1',
    'UNION ALL',
    'SELECT 2;',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
