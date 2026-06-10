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
    'end;',
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
    '',
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

runTest(
  'does not change strings, quoted identifiers or comments when applying keyword case',
  () => {
    const input = [
      "select 'select from where' as [select] -- select from comment",
      'from my_table // where comment',
      '/* select from block comment */',
      "where name = 'select'",
    ].join('\n');

    const expected = [
      "SELECT 'select from where' AS [select] -- select from comment",
      'FROM my_table // where comment',
      '/* select from block comment */',
      "WHERE name = 'select'",
      '',
    ].join('\n');

    const result = formatSql(input, watcomDialect, defaultOptions);

    assert.equal(result.text, expected);
  },
);

runTest('does not keyword-case text inside multiline block comments', () => {
  const input = ['select 1;', '/*', 'select from where', '*/', 'select 2;'].join('\n');

  const expected = ['SELECT 1;', '/*', 'select from where', '*/', 'SELECT 2;', ''].join('\n');

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
  const expected = ['select coalesce(', '  value,', '  0', ')', 'from table_name', ''].join('\n');

  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    keywordCase: 'lower',
  });

  assert.equal(result.text, expected);
});

runTest(
  'can preserve keyword casing while still applying indentation and whitespace cleanup',
  () => {
    const input = 'create procedure p()   \nbegin\nselect 1;\nend;';
    const expected = 'create procedure p()\nbegin\n  select 1;\nend;\n';

    const result = formatSql(input, watcomDialect, {
      ...defaultOptions,
      keywordCase: 'preserve',
    });

    assert.equal(result.text, expected);
  },
);

runTest('uses tabs when insertSpaces is disabled', () => {
  const input = 'begin\nselect 1;\nend;';
  const expected = 'BEGIN\n\tSELECT 1;\nEND;\n';

  const result = formatSql(input, watcomDialect, {
    ...defaultOptions,
    insertSpaces: false,
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
  const input = ['create procedure dbo.format_extra_proc()', 'begin', 'select 1;', 'end;'].join(
    '\n',
  );

  const result = formatSqlDocument(input, watcomDialect, {
    ...defaultOptions,
    applyExtrasWithFormatting: true,
    metadataHeaderEnabled: true,
    author: 'formatter-test',
  });

  assert.equal(result.changed, true);
  assert.ok(result.text.includes('-- METADATA'));
  assert.ok(result.text.includes('-- Author      : formatter-test'));
  assert.ok(result.text.includes('-- History     :'));
  assert.ok(result.text.includes('CREATE PROCEDURE dbo.format_extra_proc()'));
  assert.ok(result.text.includes('  SELECT 1;'));
});

runTest('can keep extras out of normal formatting when disabled', () => {
  const input = ['create procedure dbo.no_extra_proc()', 'begin', 'select 1;', 'end;'].join('\n');

  const result = formatSqlDocument(input, watcomDialect, {
    ...defaultOptions,
    applyExtrasWithFormatting: false,
    metadataHeaderEnabled: true,
    author: 'formatter-test',
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
    'end;',
  ].join('\n');

  const first = formatSql(input, watcomDialect, defaultOptions);
  const second = formatSql(first.text, watcomDialect, defaultOptions);

  assert.equal(second.text, first.text);
  assert.equal(second.changed, false);
});
