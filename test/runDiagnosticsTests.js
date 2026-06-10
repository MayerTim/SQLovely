const { assert, runTest } = require('./helpers/runTest');

const {
  findMissingMetadataHeaderIssue,
  findMissingMetadataHeaderIssues,
  MISSING_METADATA_HEADER_DIAGNOSTIC_CODE,
} = require('../dist/diagnostics/metadataHeaderDiagnostics');
const { insertOrUpdateMetadataHeader, METADATA_HEADER_START } = require('../dist/extras');
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
    author: 'Test Author',
  }).text;

  assert.ok(withHeader.includes(METADATA_HEADER_START));
  assert.equal(findMissingMetadataHeaderIssue(withHeader, watcomDialect), undefined);
});

runTest('does not report missing metadata when a loose legacy header can be normalized', () => {
  const input = [
    'CREATE PROCEDURE dbo.legacy_header()',
    '-- ================================',
    '-- version: 1.2',
    '-- history:',
    '-- v1.2 - existing legacy entry',
    '-- ================================',
    'BEGIN',
    'SELECT 1;',
    'END;',
  ].join('\n');

  assert.equal(findMissingMetadataHeaderIssue(input, watcomDialect), undefined);
});

runTest('does not report a diagnostic for files without supported SQL objects', () => {
  const input = 'SELECT 1;\n';
  assert.equal(findMissingMetadataHeaderIssue(input, watcomDialect), undefined);
});

runTest(
  'ignores commented-out and string-literal declarations for missing-header diagnostics',
  () => {
    const input = [
      '-- CREATE PROCEDURE fake_proc()',
      "SELECT 'CREATE FUNCTION fake_func()';",
      '/* CREATE TRIGGER fake_trigger */',
    ].join('\n');

    assert.equal(findMissingMetadataHeaderIssue(input, watcomDialect), undefined);
  },
);

runTest('reports missing metadata headers for MSSQL CREATE OR ALTER procedures', () => {
  const input = 'CREATE OR ALTER PROC [dbo].[needs_header]\nAS\nBEGIN\nSELECT 1;\nEND;\n';
  const issue = findMissingMetadataHeaderIssue(input, mssqlDialect);

  assert.ok(issue);
  assert.equal(issue.object.type, 'procedure');
  assert.equal(issue.object.name, 'dbo.needs_header');
  assert.ok(issue.message.includes('procedure dbo.needs_header'));
});

runTest('reports missing metadata headers for every supported object in a script', () => {
  const input = [
    'CREATE PROCEDURE dbo.first_missing()',
    'BEGIN',
    'END;',
    '',
    'CREATE FUNCTION dbo.second_missing() RETURNS integer',
    'BEGIN',
    'RETURN 1;',
    'END;',
  ].join('\n');
  const issues = findMissingMetadataHeaderIssues(input, watcomDialect);

  assert.equal(issues.length, 2);
  assert.equal(issues[0].object.name, 'dbo.first_missing');
  assert.equal(issues[1].object.name, 'dbo.second_missing');
});

runTest('does not use one existing metadata header for every object in a script', () => {
  const input = [
    'CREATE PROCEDURE dbo.has_header()',
    '-- METADATA',
    '--',
    '-- Description : Existing description',
    '-- Version     : 1.0',
    '-- Author      : Existing Author',
    '-- Created     : 2020-01-02',
    '-- Updated     : 2020-01-03',
    '--',
    '-- History     :',
    '--   v1.0: Existing history - 2020-01-02 Existing Author',
    '--',
    '-- METADATA END',
    'BEGIN',
    'END;',
    '',
    'CREATE PROCEDURE dbo.needs_header()',
    'BEGIN',
    'END;',
  ].join('\n');
  const issues = findMissingMetadataHeaderIssues(input, watcomDialect);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].object.name, 'dbo.needs_header');
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

runTest('keeps metadata diagnostics enabled for normal-sized documents', () => {
  const { analyzeDiagnosticSafety } = require('../dist/diagnostics/diagnosticSafety');

  const decision = analyzeDiagnosticSafety('CREATE PROCEDURE dbo.small()\nBEGIN\nEND;\n', {
    enabled: true,
    maxComplexDocumentLength: 1000,
    maxComplexDocumentLines: 100,
    maxComplexLineLength: 1000,
  });

  assert.equal(decision.skipExpensiveMetadataDiagnostics, false);
});

runTest('skips expensive metadata diagnostics for large documents', () => {
  const { analyzeDiagnosticSafety } = require('../dist/diagnostics/diagnosticSafety');

  const decision = analyzeDiagnosticSafety('line1\nline2\nline3\n', {
    enabled: true,
    maxComplexDocumentLength: 1000,
    maxComplexDocumentLines: 2,
    maxComplexLineLength: 1000,
  });

  assert.equal(decision.skipExpensiveMetadataDiagnostics, true);
  assert.ok(decision.formattingSafety.reasons.some((reason) => reason.includes('line count')));
});

runTest('does not skip diagnostics when safety guards are disabled', () => {
  const { analyzeDiagnosticSafety } = require('../dist/diagnostics/diagnosticSafety');

  const decision = analyzeDiagnosticSafety('line1\nline2\nline3\n', {
    enabled: false,
    maxComplexDocumentLength: 1,
    maxComplexDocumentLines: 1,
    maxComplexLineLength: 1,
  });

  assert.equal(decision.skipExpensiveMetadataDiagnostics, false);
});
