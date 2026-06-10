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
