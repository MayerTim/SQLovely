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

runTest('splits Watcom parenthesized parameter lists across indented lines', () => {
  const input = [
    'CREATE OR REPLACE FUNCTION "FCT"."OP_GTIN_VorherIstGrenze"(',
    'IN "iText" long varchar,IN "iIndexPosition" integer )',
    'RETURNS integer',
    'BEGIN',
    'END;',
  ].join('\n');

  const expected = [
    'CREATE OR REPLACE FUNCTION "FCT"."OP_GTIN_VorherIstGrenze"(',
    '  IN "iText" long varchar,',
    '  IN "iIndexPosition" integer',
    ')',
    'RETURNS integer',
    'BEGIN',
    'END;',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest(
  'splits nested Watcom function-call parentheses without touching string literals or type lengths',
  () => {
    const input = [
      'select my_func(isnull(test), test);',
      "select '(' || my_func(value) || ')' as value;",
      'returns varchar(14)',
    ].join('\n');

    const expected = [
      'SELECT my_func(',
      '  ISNULL(',
      '    test',
      '  ),',
      '  test',
      ');',
      "SELECT '(' || my_func(",
      '  VALUE',
      ") || ')' AS VALUE;",
      'RETURNS varchar(14)',
      '',
    ].join('\n');

    const result = formatSql(input, watcomDialect, defaultOptions);

    assert.equal(result.text, expected);
  },
);
