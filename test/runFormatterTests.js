const fs = require('fs');
const path = require('path');
const { assert, runTest } = require('./helpers/runTest');

const { formatSql, formatSqlDocument, formatSqlRangeText } = require('../dist/formatter');
const { watcomDialect } = require('../dist/dialects/watcom/dialect');
const { mssqlDialect } = require('../dist/dialects/mssql/dialect');

const defaultOptions = {
  keywordCase: 'upper',
  indentSize: 2,
  insertSpaces: true,
  maxConsecutiveBlankLines: 1,
  ensureFinalNewline: true
};

function readFixture(relativePath) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', relativePath), 'utf8');
}

runTest('formats Watcom keywords and indentation conservatively', () => {
  const input = [
    'create procedure dbo.my_proc()',
    'begin',
    'select 1;',
    'if a = 1 then',
    'select 2;',
    'else',
    'select 3;',
    'endif;',
    'end;'
  ].join('\n');

  const expected = [
    'CREATE PROCEDURE dbo.my_proc()',
    'BEGIN',
    '  SELECT 1;',
    '  IF a = 1 THEN',
    '    SELECT 2;',
    '  ELSE',
    '    SELECT 3;',
    '  ENDIF;',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.changed, true);
  assert.equal(result.text, expected);
});

runTest('formats Watcom fixture input to expected output', () => {
  const input = readFixture('formatter/watcom/procedure.input.sql');
  const expected = readFixture('formatter/watcom/procedure.expected.sql');
  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('formats MSSQL fixture input to expected output', () => {
  const input = readFixture('formatter/mssql/procedure.input.sql');
  const expected = readFixture('formatter/mssql/procedure.expected.sql');
  const result = formatSql(input, mssqlDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('does not change strings, quoted identifiers or comments when applying keyword case', () => {
  const input = [
    "select 'select from where' as [select] -- select from comment",
    'from my_table // where comment',
    '/* select from block comment */',
    "where name = 'select'"
  ].join('\n');

  const expected = [
    "SELECT 'select from where' AS [select] -- select from comment",
    'FROM my_table // where comment',
    '/* select from block comment */',
    "WHERE name = 'select'",
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('does not keyword-case text inside multiline block comments', () => {
  const input = [
    'select 1;',
    '/*',
    'select from where',
    '*/',
    'select 2;'
  ].join('\n');

  const expected = [
    'SELECT 1;',
    '/*',
    'select from where',
    '*/',
    'SELECT 2;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('compresses blank lines, removes trailing whitespace and keeps one final newline', () => {
  const input = 'select 1;   \n\n\nselect 2;\t\t';
  const expected = 'SELECT 1;\n\nSELECT 2;\n';

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('supports lower-case keyword formatting', () => {
  const input = 'SELECT COALESCE(value, 0) FROM table_name';
  const expected = [
    'select coalesce(',
    '  value,',
    '  0',
    ')',
    'from table_name',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    keywordCase: 'lower'
  });

  assert.equal(result.text, expected);
});

runTest('can preserve keyword casing while still applying indentation and whitespace cleanup', () => {
  const input = 'create procedure p()   \nbegin\nselect 1;\nend;';
  const expected = 'create procedure p()\nbegin\n  select 1;\nend;\n';

  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    keywordCase: 'preserve'
  });

  assert.equal(result.text, expected);
});

runTest('formats known MSSQL procedure aliases with the active MSSQL dialect', () => {
  const input = 'create or alter proc dbo.my_proc\nas\nbegin\nselect getdate();\nend;';
  const expected = [
    'CREATE OR ALTER PROC dbo.my_proc',
    'AS',
    'BEGIN',
    '  SELECT GETDATE();',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, mssqlDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('uses tabs when insertSpaces is disabled', () => {
  const input = 'begin\nselect 1;\nend;';
  const expected = 'BEGIN\n\tSELECT 1;\nEND;\n';

  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    insertSpaces: false
  });

  assert.equal(result.text, expected);
});

runTest('can format range text without forcing a final newline', () => {
  const input = 'select 1;';
  const result = formatSqlRangeText(input, watcomDialect, defaultOptions);

  assert.equal(result.text, 'SELECT 1;');
});

runTest('formatter preserves CRLF line endings', () => {
  const input = 'begin\r\nselect 1;\r\nend;\r\n';
  const expected = 'BEGIN\r\n  SELECT 1;\r\nEND;\r\n';
  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});


runTest('can apply enabled extras as part of normal formatting', () => {
  const input = [
    'create procedure dbo.format_extra_proc()',
    'begin',
    'select 1;',
    'end;'
  ].join('\n');

  const result = formatSqlDocument(input, watcomDialect, {
    ...defaultOptions,
    applyExtrasWithFormatting: true,
    metadataHeaderEnabled: true,
    author: 'formatter-test'
  });

  assert.equal(result.changed, true);
  assert.ok(result.text.includes('-- METADATA'));
  assert.ok(result.text.includes('-- Author      : formatter-test'));
  assert.ok(result.text.includes('-- History     :'));
  assert.ok(result.text.includes('CREATE PROCEDURE dbo.format_extra_proc()'));
  assert.ok(result.text.includes('  SELECT 1;'));
});

runTest('can keep extras out of normal formatting when disabled', () => {
  const input = [
    'create procedure dbo.no_extra_proc()',
    'begin',
    'select 1;',
    'end;'
  ].join('\n');

  const result = formatSqlDocument(input, watcomDialect, {
    ...defaultOptions,
    applyExtrasWithFormatting: false,
    metadataHeaderEnabled: true,
    author: 'formatter-test'
  });

  assert.equal(result.changed, true);
  assert.ok(!result.text.includes('-- METADATA'));
  assert.ok(result.text.includes('CREATE PROCEDURE dbo.no_extra_proc()'));
});

runTest('formatter is idempotent', () => {
  const input = [
    'create procedure p()',
    'begin',
    'if a = 1 then',
    'select today();',
    'else',
    'select now();',
    'endif;',
    'end;'
  ].join('\n');

  const first = formatSql(input, watcomDialect, defaultOptions);
  const second = formatSql(first.text, watcomDialect, defaultOptions);

  assert.equal(second.text, first.text);
  assert.equal(second.changed, false);
});

runTest('formats rudimentary MSSQL TRY/CATCH, analytic functions and GO batch separators', () => {
  const input = [
    'create or alter proc [dbo].[try_proc]',
    'as',
    'begin try',
    'select sysdatetime();',
    'end try',
    'begin catch',
    'throw;',
    'end catch',
    'go',
    'select row_number() over (partition by category order by id) as rn',
    'from dbo.items;'
  ].join('\n');

  const expected = [
    'CREATE OR ALTER PROC [dbo].[try_proc]',
    'AS',
    'BEGIN TRY',
    '  SELECT SYSDATETIME();',
    'END TRY',
    'BEGIN CATCH',
    '  THROW;',
    'END CATCH',
    'GO',
    'SELECT ROW_NUMBER() OVER (PARTITION BY category ORDER BY id) AS rn',
    'FROM dbo.items;',
    ''
  ].join('\n');

  const result = formatSql(input, mssqlDialect, defaultOptions);

  assert.equal(result.text, expected);
});

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
    'grant execute on "FCT"."stacked" to "FCT";'
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
    ''
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
    'grant execute on "FCT"."same_line" to "FCT";'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  BEGIN SELECT 1; END;',
    '  IF a = 1 THEN IF b = 1 THEN SELECT 2; END IF END IF; -- generated compact nesting',
    '  SELECT 3;',
    'END;',
    'GRANT EXECUTE ON "FCT"."same_line" TO "FCT";',
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


runTest('indents Watcom query list continuations and predicate function arguments', () => {
  const input = [
    'begin',
    'select',
    '"art",',
    '"Einheit"',
    'into',
    '"vMaterialart",',
    '"vEinheit"',
    'from "DBA"."OP_MATERIAL"',
    'where "lfd" = "vMaterialLfd"',
    'and isnull("omp"."Lf_MakroTermin", 0) = isnull("vMakroTerminLfd", 0)',
    'order by',
    'if "pr"."Role" = \'Instrumenteur1\' then 1 else 2 endif,',
    '"pr"."Reihenfolge";',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  SELECT',
    '    "art",',
    '    "Einheit"',
    '  INTO',
    '    "vMaterialart",',
    '    "vEinheit"',
    '  FROM "DBA"."OP_MATERIAL"',
    '  WHERE "lfd" = "vMaterialLfd"',
    '    AND ISNULL(',
    '      "omp"."Lf_MakroTermin",',
    '      0',
    '    ) = ISNULL(',
    '      "vMakroTerminLfd",',
    '      0',
    '    )',
    '  ORDER BY',
    '    IF "pr"."Role" = \'Instrumenteur1\' THEN 1 ELSE 2 ENDIF,',
    '    "pr"."Reihenfolge";',
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
    '    SET "vPos" = "vPos"+1',
    '  END LOOP;',
    '  SELECT 1;',
    'END;',
    'GRANT EXECUTE ON "FCT"."elseif_test" TO "FCT";',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});


runTest('splits Watcom parenthesized parameter lists across indented lines', () => {
  const input = [
    'CREATE OR REPLACE FUNCTION "FCT"."OP_GTIN_VorherIstGrenze"(',
    'IN "iText" long varchar,IN "iIndexPosition" integer )',
    'RETURNS integer',
    'BEGIN',
    'END;'
  ].join('\n');

  const expected = [
    'CREATE OR REPLACE FUNCTION "FCT"."OP_GTIN_VorherIstGrenze"(',
    '  IN "iText" long varchar,',
    '  IN "iIndexPosition" integer',
    ')',
    'RETURNS integer',
    'BEGIN',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('splits nested Watcom function-call parentheses without touching string literals or type lengths', () => {
  const input = [
    'select my_func(isnull(test), test);',
    "select '(' || my_func(value) || ')' as value;",
    'returns varchar(14)'
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
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('keeps UNION ALL on its own physical line', () => {
  const input = [
    'begin',
    'select 1 union all select 2;',
    'select 3 UNION ALL',
    'select 4;',
    'end;'
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
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('does not split UNION ALL inside strings or comments', () => {
  const input = [
    "select 'union all' as value -- union all comment",
    '/* union all inside block comment */',
    'select 1 union all select 2;'
  ].join('\n');

  const expected = [
    "SELECT 'union all' AS VALUE -- union all comment",
    '/* union all inside block comment */',
    'SELECT 1',
    'UNION ALL',
    'SELECT 2;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('splits Watcom query clauses and join predicates onto stable lines', () => {
  const input = [
    'begin',
    'select "a"."id", "b"."name" from "a" left outer join "b" on "a"."id" = "b"."id" and "b"."active" = 1 where "a"."status" = \'from where join\' and "a"."flag" = 1 order by "a"."id";',
    'end;'
  ].join('\n');

  const expected = [
    'BEGIN',
    '  SELECT "a"."id", "b"."name"',
    '  FROM "a"',
    '  LEFT OUTER JOIN "b"',
    '    ON "a"."id" = "b"."id"',
    '    AND "b"."active" = 1',
    '  WHERE "a"."status" = \'from where join\'',
    '    AND "a"."flag" = 1',
    '  ORDER BY "a"."id";',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('does not split Watcom query clauses inside strings, comments or nested subqueries', () => {
  const input = [
    "select 'from where join on' as note -- from t where x = 1",
    'from outer_table where id in (select id from inner_table where flag = 1) and active = 1;'
  ].join('\n');

  const expected = [
    "SELECT 'from where join on' AS note -- from t where x = 1",
    'FROM outer_table',
    'WHERE id IN(',
    '  SELECT id FROM inner_table WHERE flag = 1',
    ')',
    '  AND active = 1;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

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

runTest('formats compact Watcom CASE expressions without leaking indentation', () => {
  const input = [
    'begin',
    'set "v" = case when "a" = 1 then 1 when "a" = 2 then 2 else 0 end;',
    'select case when "a" = 1 then \'yes\' else \'no\' end as "flag" from "items" where "active" = 1 and "deleted" = 0;',
    'select 2;',
    'end;'
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
    '    THEN \'yes\'',
    '    ELSE \'no\'',
    '  END AS "flag"',
    '  FROM "items"',
    '  WHERE "active" = 1',
    '    AND "deleted" = 0;',
    '  SELECT 2;',
    'END;',
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('preserves nested Watcom CASE expressions and ignores strings or comments', () => {
  const input = [
    "select 'case when then else end' as note -- case when comment",
    'begin',
    'set "v" = case when "a" = 1 then case when "b" = 1 then 2 else 3 end else 0 end;',
    'end;'
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
    ''
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

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

runTest('formatter skips expensive Watcom passes for large documents', () => {
  const input = [
    'begin',
    ...Array.from({ length: 101 }, () => 'select 1 union all select 2;'),
    'end;'
  ].join('\n');

  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    safetyLimits: {
      enabled: true,
      maxComplexDocumentLength: 1000000,
      maxComplexDocumentLines: 100,
      maxComplexLineLength: 5000
    }
  });

  assert.ok(result.text.includes('SELECT 1 UNION ALL SELECT 2;'));
  assert.ok(!result.text.includes('UNION ALL\n  SELECT 2;'));
  assert.equal(result.safety.skipExpensiveFormatting, true);
  assert.ok(result.safetySummary.includes('line count'));
});

runTest('formatter keeps very long lines out of expensive line-level passes', () => {
  const longValue = 'x'.repeat(300);
  const input = `select my_func(${longValue}), other;`;
  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    safetyLimits: {
      enabled: true,
      maxComplexDocumentLength: 1000000,
      maxComplexDocumentLines: 5000,
      maxComplexLineLength: 250
    }
  });

  assert.equal(result.text, `SELECT my_func(${longValue}), other;\n`);
  assert.equal(result.safety.skipExpensiveFormatting, false);
});

runTest('formatter returns the original text when cancellation is requested', () => {
  const input = 'begin\nselect 1 union all select 2;\nend;';
  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    isCancellationRequested: () => true
  });

  assert.equal(result.text, input);
  assert.equal(result.changed, false);
});
