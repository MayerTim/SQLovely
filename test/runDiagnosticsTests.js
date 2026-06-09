const { assert, runTest } = require('./helpers/runTest');

const {
  findMissingMetadataHeaderIssue,
  MISSING_METADATA_HEADER_DIAGNOSTIC_CODE
} = require('../dist/diagnostics/metadataHeaderDiagnostics');
const {
  insertOrUpdateMetadataHeader,
  METADATA_HEADER_START
} = require('../dist/extras');
const { watcomDialect } = require('../dist/dialects/watcom/dialect');
const { mssqlDialect } = require('../dist/dialects/mssql/dialect');

const fixedDate = new Date('2026-06-09T12:00:00.000Z');

runTest('reports a missing metadata header for a Watcom procedure', () => {
  const input = 'CREATE PROCEDURE dbo.needs_header()\nBEGIN\nEND;\n';
  const issue = findMissingMetadataHeaderIssue(input, watcomDialect);

  assert.ok(issue);
  assert.equal(issue.code, MISSING_METADATA_HEADER_DIAGNOSTIC_CODE);
  assert.equal(issue.object.type, 'procedure');
  assert.equal(issue.object.name, 'dbo.needs_header');
  assert.equal(issue.startIndex, 0);
  assert.equal(issue.endIndex, input.indexOf('\n'));
  assert.ok(issue.message.includes('procedure dbo.needs_header'));
});

runTest('does not report a diagnostic when a SQLovely metadata header already exists', () => {
  const input = 'CREATE FUNCTION dbo.has_header() RETURNS integer\nBEGIN\nRETURN 1;\nEND;\n';
  const withHeader = insertOrUpdateMetadataHeader(input, watcomDialect, {
    now: fixedDate,
    author: 'Test Author'
  }).text;

  assert.ok(withHeader.includes(METADATA_HEADER_START));
  assert.equal(findMissingMetadataHeaderIssue(withHeader, watcomDialect), undefined);
});

runTest('does not report a diagnostic for files without supported SQL objects', () => {
  const input = 'SELECT 1;\n';
  assert.equal(findMissingMetadataHeaderIssue(input, watcomDialect), undefined);
});

runTest('ignores commented-out and string-literal declarations for missing-header diagnostics', () => {
  const input = [
    '-- CREATE PROCEDURE fake_proc()',
    "SELECT 'CREATE FUNCTION fake_func()';",
    '/* CREATE TRIGGER fake_trigger */'
  ].join('\n');

  assert.equal(findMissingMetadataHeaderIssue(input, watcomDialect), undefined);
});

runTest('reports missing metadata headers for MSSQL CREATE OR ALTER procedures', () => {
  const input = 'CREATE OR ALTER PROC [dbo].[needs_header]\nAS\nBEGIN\nSELECT 1;\nEND;\n';
  const issue = findMissingMetadataHeaderIssue(input, mssqlDialect);

  assert.ok(issue);
  assert.equal(issue.object.type, 'procedure');
  assert.equal(issue.object.name, 'dbo.needs_header');
  assert.ok(issue.message.includes('procedure dbo.needs_header'));
});

runTest('reports SQLovely max-line-length diagnostics', () => {
  const { findMaxLineLengthIssues } = require('../dist/diagnostics/lineLengthDiagnostics');
  const input = `SELECT ${'x'.repeat(130)};\nSELECT 1;\n`;
  const issues = findMaxLineLengthIssues(input, 120);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'sqlovely.maxLineLength');
  assert.equal(issues[0].line, 0);
  assert.equal(issues[0].limit, 120);
});
