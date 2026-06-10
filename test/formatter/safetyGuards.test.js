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
