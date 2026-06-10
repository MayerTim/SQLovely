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

runTest('splits compact Watcom IF statements before applying indentation', () => {
  const input = [
    'begin',
    'IF "iZiffernfolge" IS NULL OR "iZiffernfolge" = \'\' THEN RETURN 0 END IF;',
    'SET "vLaenge" = "char_length"("iZiffernfolge");',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  IF "iZiffernfolge" IS NULL',
    '    OR "iZiffernfolge" = \'\'',
    '  THEN',
    '    RETURN 0',
    '  END IF;',
    '  SET "vLaenge" = "char_length"(',
    '    "iZiffernfolge"',
    '  );',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('does not let compact Watcom IF statements leak indentation into following objects', () => {
  const input = [
    'create or replace function "FCT"."first"()',
    'returns integer',
    'begin',
    'IF a IS NULL THEN RETURN 0 END IF;',
    'end;',
    'grant execute on "FCT"."first" to "FCT";',
    'create or replace function "FCT"."second"()',
    'returns integer',
    'begin',
    'return 1',
    'end;'
  ].join('\n');

  const expected = [
    'CREATE OR REPLACE FUNCTION "FCT"."first"()',
    'RETURNS integer',
    'BEGIN',
    '  IF a IS NULL',
    '  THEN',
    '    RETURN 0',
    '  END IF;',
    'END;',
    'GRANT EXECUTE ON "FCT"."first" TO "FCT";',
    'CREATE OR REPLACE FUNCTION "FCT"."second"()',
    'RETURNS integer',
    'BEGIN',
    '  RETURN 1',
    'END;',
    ''
  ].join('\n');


  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('keeps Watcom IF expressions inline instead of rewriting them as control-flow blocks', () => {
  const input = [
    'begin',
    'IF a = 1 THEN 1 ELSE 0 ENDIF;',
    'select (if "v" is null then 0 else 1 endif) as flag;',
    'select 2;',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  IF a = 1 THEN 1 ELSE 0 ENDIF;',
    '  SELECT(',
    '    IF "v" IS NULL THEN 0 ELSE 1 ENDIF',
    '  ) AS flag;',
    '  SELECT 2;',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('normalizes split Watcom IF expressions without treating them as procedural blocks', () => {
  const input = [
    'begin',
    'order by',
    "if \"pr\".\"Role\" = 'Instrumenteur1'",
    'then',
    '1 else 2',
    'end if,',
    '"pr"."Reihenfolge",',
    '"pr"."lfd";',
    'if a = 1',
    'then',
    'set b = 1',
    'else',
    'set b = 2',
    'end if;',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  ORDER BY',
    "    IF \"pr\".\"Role\" = 'Instrumenteur1' THEN 1 ELSE 2 ENDIF,",
    '    "pr"."Reihenfolge",',
    '    "pr"."lfd";',
    '  IF a = 1',
    '  THEN',
    '    SET b = 1',
    '  ELSE',
    '    SET b = 2',
    '  END IF;',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('restores ORDER BY separators after split Watcom IF expression continuations', () => {
  const input = [
    'begin',
    'order by',
    "if \"pr\".\"Role\" = 'Instrumenteur1'",
    'then',
    '1 else 2',
    'end if',
    '"pr"."Reihenfolge",',
    '"pr"."lfd";',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  ORDER BY',
    "    IF \"pr\".\"Role\" = 'Instrumenteur1' THEN 1 ELSE 2 ENDIF,",
    '    "pr"."Reihenfolge",',
    '    "pr"."lfd";',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('treats Watcom ELSEIF as a branch keyword without leaking indentation', () => {
  const input = [
    'begin',
    'while "vPos" <= "vEnde" loop',
    'if "vZeichen" between \'0\' and \'9\' then',
    'set "vReineZiffern" = "vReineZiffern" || "vZeichen"',
    'elseif "vZeichen" in(\' \', "char"(9), "char"(10), "char"(13)) then',
    '-- ignorieren',
    'else',
    'set "vFehlerhafteZeichenVorhanden" = 1;',
    'leave',
    'end if;',
    'set "vPos" = "vPos"+1',
    'end loop;',
    'select 1;',
    'end;',
    'grant execute on "FCT"."elseif_test" to "FCT";'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  WHILE "vPos" <= "vEnde" LOOP',
    '    IF "vZeichen" BETWEEN \'0\' AND \'9\' THEN',
    '      SET "vReineZiffern" = "vReineZiffern" || "vZeichen"',
    '    ELSEIF "vZeichen" IN(',
    '      \' \',',
    '      "char"(',
    '        9',
    '      ),',
    '      "char"(',
    '        10',
    '      ),',
    '      "char"(',
    '        13',
    '      )',
    '    ) THEN',
    '      -- ignorieren',
    '    ELSE',
    '      SET "vFehlerhafteZeichenVorhanden" = 1;',
    '      LEAVE',
    '    END IF;',
    '    SET "vPos" = "vPos" + 1',
    '  END LOOP;',
    '  SELECT 1;',
    'END;',
    'GRANT EXECUTE ON "FCT"."elseif_test" TO "FCT";',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
