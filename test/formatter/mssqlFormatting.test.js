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

runTest('formats MSSQL fixture input to expected output', () => {
  const input = readFixture('formatter/mssql/procedure.input.sql');
  const expected = readFixture('formatter/mssql/procedure.expected.sql');
  const result = formatSql(input, mssqlDialect, defaultOptions);

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
