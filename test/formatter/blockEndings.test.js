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

runTest('splits stacked Watcom block endings before applying indentation', () => {
  const input = [
    'begin',
    'if a = 1 then',
    'if b = 1 then',
    'select 1;',
    'end if end if;',
    'select 2;',
    'for "c" as "C" dynamic scroll cursor for select "id" from "items" do',
    'if "id" = 1 then',
    'if "id" > 0 then',
    'leave',
    'end if end if end for;',
    'select 3;',
    'end;',
    'grant execute on "FCT"."stacked" to "FCT";',
  ].join('\n');

  const expected = [
    'BEGIN',
    '  IF a = 1 THEN',
    '    IF b = 1 THEN',
    '      SELECT 1;',
    '    END IF',
    '  END IF;',
    '  SELECT 2;',
    '  FOR "c" AS "C" DYNAMIC SCROLL CURSOR FOR',
    '    SELECT "id"',
    '    FROM "items"',
    '  DO',
    '    IF "id" = 1 THEN',
    '      IF "id" > 0 THEN',
    '        LEAVE',
    '      END IF',
    '    END IF',
    '  END FOR;',
    '  SELECT 3;',
    'END;',
    'GRANT EXECUTE ON "FCT"."stacked" TO "FCT";',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('counts multiple block openings and endings on the same physical line', () => {
  const input = [
    'begin',
    'begin select 1; end;',
    'if a = 1 then if b = 1 then select 2; end if end if; -- generated compact nesting',
    'select 3;',
    'end;',
    'grant execute on "FCT"."same_line" to "FCT";',
  ].join('\n');

  const expected = [
    'BEGIN',
    '  BEGIN SELECT 1; END;',
    '  IF a = 1 THEN IF b = 1 THEN SELECT 2; END IF END IF; -- generated compact nesting',
    '  SELECT 3;',
    'END;',
    'GRANT EXECUTE ON "FCT"."same_line" TO "FCT";',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
