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

runTest('aligns Watcom temporary-table closing parentheses and removes trailing DDL commas', () => {
  const input = [
    'begin',
    'declare local temporary table "decode_result"("ID" varchar(4) null,"Beschreibung" varchar(254) null,"Val" varchar(30) null,) on commit delete rows;',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  DECLARE local TEMPORARY TABLE "decode_result"(',
    '    "ID" varchar(4) NULL,',
    '    "Beschreibung" varchar(254) NULL,',
    '    "Val" varchar(30) NULL',
    '  ) ON COMMIT DELETE ROWS;',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('keeps non-DDL trailing commas and closing-parenthesis indentation unchanged', () => {
  const input = [
    'begin',
    'set "v" = my_func("a",);',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  SET "v" = my_func(',
    '    "a",',
    '  );',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
