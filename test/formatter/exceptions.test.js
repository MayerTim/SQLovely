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

runTest('formats Watcom exception handlers with stable indentation', () => {
  const input = [
    'begin',
    'set "v" = 1;',
    'exception when others then begin',
    'set "v" = 0;',
    'end',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  SET "v" = 1;',
    'EXCEPTION',
    '  WHEN OTHERS THEN',
    '    BEGIN',
    '      SET "v" = 0;',
    '    END',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('keeps ON EXCEPTION RESUME and exception declarations as normal statements', () => {
  const input = [
    'begin',
    'on exception resume',
    'declare "ex" exception for sqlstate value \'75000\';',
    "select 'exception when others then begin' as note -- exception when others then begin",
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  ON EXCEPTION RESUME',
    '  DECLARE "ex" EXCEPTION FOR SQLSTATE VALUE \'75000\';',
    "  SELECT 'exception when others then begin' AS note -- exception when others then begin",
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
