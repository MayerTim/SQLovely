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

runTest('formats Watcom UPDATE SET assignment continuations and arithmetic spacing', () => {
  const input = [
    'begin',
    'update "DBA"."OP_MATERIAL_PLAN"',
    'set "Menge" = "vCurrentMenge"-"vMenge",',
    '"Zeitpunkt"',
    '= current time',
    'where "lfd" = "iOPMaterialPlanLfd"',
    'end;',
  ].join('\n');

  const expected = [
    'BEGIN',
    '  UPDATE "DBA"."OP_MATERIAL_PLAN"',
    '  SET "Menge" = "vCurrentMenge" - "vMenge",',
    '    "Zeitpunkt" = CURRENT time',
    '  WHERE "lfd" = "iOPMaterialPlanLfd"',
    'END;',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});

runTest('formats compact Watcom select lists with comma spacing only outside quoted text', () => {
  const input = [
    'begin',
    'select "oGtin","oCharge","oSeriennr"',
    'select \'a,b\',"x,y",1+2',
    'end;',
  ].join('\n');

  const expected = [
    'BEGIN',
    '  SELECT "oGtin", "oCharge", "oSeriennr"',
    '  SELECT \'a,b\', "x,y", 1 + 2',
    'END;',
    '',
  ].join('\n');

  const result = formatSql(input, watcomDialect, defaultOptions);

  assert.equal(result.text, expected);
});
