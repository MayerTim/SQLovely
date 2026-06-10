const fs = require('fs');
const path = require('path');
const { assert, runTest } = require('../helpers/runTest');

const { formatSql, formatSqlDocument, formatSqlRangeText } = require('../../dist/formatter');
const { watcomDialect } = require('../../dist/dialects/watcom/dialect');
const { mssqlDialect } = require('../../dist/dialects/mssql/dialect');

const defaultOptions = {
  keywordCase: 'upper',
  indentSize: 2,
  insertSpaces: true,
  maxConsecutiveBlankLines: 1,
  ensureFinalNewline: true
};

function readFixture(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', relativePath), 'utf8');
}

module.exports = {
  assert,
  runTest,
  formatSql,
  formatSqlDocument,
  formatSqlRangeText,
  watcomDialect,
  mssqlDialect,
  defaultOptions,
  readFixture
};
