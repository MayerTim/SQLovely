const { assert, runTest } = require('./helpers/runTest');

const {
  insertOrUpdateMetadataHeader,
  METADATA_HEADER_END,
  METADATA_HEADER_START
} = require('../dist/extras');
const {
  findMissingMetadataHeaderIssues
} = require('../dist/diagnostics/metadataHeaderDiagnostics');
const { watcomDialect } = require('../dist/dialects/watcom/dialect');

const fixedDate = new Date('2026-06-09T12:00:00.000Z');
const options = { now: fixedDate, author: 'Test Author' };

runTest('normalizes single-slash legacy metadata headers before Watcom procedure bodies', () => {
  const input = [
    'CREATE OR REPLACE PROCEDURE "fct"."procedureName"',
    '( IN "parameter1" integer, IN "parameter2" integer )',
    '/ ---------------------------------------------------------------------------',
    '/                     procedureName',
    '/ ---------------------------------------------------------------------------',
    '/',
    '/ beschreibung',
    '/',
    '/ version:             1.00',
    '/ erstellt Datum:      xx.xx.xxxx      erstellt von: t.mayer',
    '/ letzte Änderung:',
    '/',
    '/ ---------------------------------------------------------------------------',
    '/ history:',
    '/ v1.00 - erstellt',
    '/ ---------------------------------------------------------------------------',
    'BEGIN',
    '  SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes(')\n-- METADATA\n'));
  assert.ok(result.text.includes('-- Description : <TODO>'));
  assert.ok(result.text.includes('-- Version     : 1.00'));
  assert.ok(result.text.includes('-- Author      : t.mayer'));
  assert.ok(result.text.includes('-- Created     : xx.xx.xxxx'));
  assert.ok(result.text.includes('-- Updated     : 2026-06-09'));
  assert.ok(result.text.includes('--   v1.00: erstellt'));
  assert.ok(result.text.includes(`${METADATA_HEADER_END}\nBEGIN`));
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
  assert.equal(result.text.includes('/ version:'), false);
  assert.equal(result.text.includes('/ history:'), false);
});

runTest('normalizes block-comment legacy metadata headers before function bodies', () => {
  const input = [
    'CREATE FUNCTION dbo.block_header() RETURNS integer',
    '/*',
    ' * Description: Calculates the block-comment value',
    ' * Version: v1.0',
    ' * Created: 2021-03-04',
    ' * Author: Legacy Author',
    ' * History:',
    ' * v1.0 - migrated from block comment template',
    ' */',
    'BEGIN',
    'RETURN 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Description : Calculates the block-comment value'));
  assert.ok(result.text.includes('-- Version     : 1.0'));
  assert.ok(result.text.includes('-- Author      : Legacy Author'));
  assert.ok(result.text.includes('-- Created     : 2021-03-04'));
  assert.ok(result.text.includes('--   v1.0: migrated from block comment template'));
  assert.equal(result.text.includes('/*'), false);
  assert.equal(result.text.includes(' * Version'), false);
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
});

runTest('leaves loose comments without a version untouched while inserting metadata', () => {
  const input = [
    'CREATE PROCEDURE dbo.comment_without_version()',
    '/ This procedure comment is not metadata.',
    '/ It should stay because it has no version field.',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'inserted');
  assert.ok(result.text.includes('/ This procedure comment is not metadata.'));
  assert.ok(result.text.includes('/ It should stay because it has no version field.'));
  assert.ok(result.text.includes('-- Version     : 1.0'));
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
});

runTest('synchronizes version and history independently for multiple existing headers', () => {
  const input = [
    'CREATE PROCEDURE dbo.first_existing()',
    '-- METADATA',
    '--',
    '-- Description : First existing header',
    '-- Version     : 1.0',
    '-- Author      : First Author',
    '-- Created     : 2020-01-02',
    '-- Updated     : 2020-01-03',
    '--',
    '-- History     :',
    '--   v1.0: Initial creation - 2020-01-02 First Author',
    '--   v1.1: Added validation - 2020-02-03 First Author',
    '--',
    '-- METADATA END',
    'BEGIN',
    'SELECT 1;',
    'END;',
    '',
    'CREATE FUNCTION dbo.second_existing() RETURNS integer',
    '-- METADATA',
    '--',
    '-- Description : Second existing header',
    '-- Version     : 2.0',
    '-- Author      : Second Author',
    '-- Created     : 2020-03-04',
    '-- Updated     : 2020-03-05',
    '--',
    '-- History     :',
    '--   v1.0: Initial creation - 2020-03-04 Second Author',
    '--',
    '-- METADATA END',
    'BEGIN',
    'RETURN 2;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 2);
  assertInObjectSection(result.text, 'dbo.first_existing', '-- Version     : 1.1');
  assertInObjectSection(result.text, 'dbo.first_existing', '--   v1.1: Added validation - 2020-02-03 First Author');
  assertInObjectSection(result.text, 'dbo.second_existing', '-- Version     : 2.0');
  assertInObjectSection(result.text, 'dbo.second_existing', '--   v2.0: <TODO> - 2026-06-09 Second Author');
});

runTest('normalizes invalid history version jumps to consecutive one-step bumps', () => {
  const input = [
    'CREATE PROCEDURE dbo.invalid_history_sequence()',
    '-- METADATA',
    '--',
    '-- Description : Existing description',
    '-- Version     : 3.5',
    '-- Author      : Existing Author',
    '-- Created     : 2020-01-02',
    '-- Updated     : 2020-01-03',
    '--',
    '-- History     :',
    '--   v1.0: Initial creation - 2020-01-02 Existing Author',
    '--   v3.0: Invalid major jump - 2020-02-03 Existing Author',
    '--   v3.5: Invalid minor jump - 2020-03-04 Existing Author',
    '--',
    '-- METADATA END',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Version     : 3.0'));
  assert.ok(result.text.includes('--   v1.0: Initial creation - 2020-01-02 Existing Author'));
  assert.ok(result.text.includes('--   v2.0: Invalid major jump - 2020-02-03 Existing Author'));
  assert.ok(result.text.includes('--   v3.0: Invalid minor jump - 2020-03-04 Existing Author'));
  assert.equal(result.text.includes('--   v3.5:'), false);
});

runTest('preserves patch-version schemes when adding missing history entries', () => {
  const input = [
    'CREATE PROCEDURE dbo.patch_version_bump()',
    '-- METADATA',
    '--',
    '-- Description : Existing description',
    '-- Version     : 1.0.1',
    '-- Author      : Existing Author',
    '-- Created     : 2020-01-02',
    '-- Updated     : 2020-01-03',
    '--',
    '-- History     :',
    '--   v1.0.0: Initial creation - 2020-01-02 Existing Author',
    '--',
    '-- METADATA END',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Version     : 1.0.1'));
  assert.ok(result.text.includes('--   v1.0.0: Initial creation - 2020-01-02 Existing Author'));
  assert.ok(result.text.includes('--   v1.0.1: <TODO> - 2026-06-09 Existing Author'));
});

runTest('normalizes legacy headers and synchronizes invalid legacy version bumps in one pass', () => {
  const input = [
    'CREATE PROCEDURE dbo.legacy_invalid_version()',
    '-- -------------------------',
    '-- description: Legacy invalid bump',
    '-- version: 1.5',
    '-- author: Legacy Author',
    '-- history:',
    '-- v1.0 - initial creation',
    '-- -------------------------',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Description : Legacy invalid bump'));
  assert.ok(result.text.includes('-- Version     : 1.1'));
  assert.ok(result.text.includes('-- Author      : Legacy Author'));
  assert.ok(result.text.includes('--   v1.0: initial creation'));
  assert.ok(result.text.includes('--   v1.1: <TODO> - 2026-06-09 Legacy Author'));
  assert.equal(result.text.includes('-- Version     : 1.5'), false);
});

runTest('normalizes metadata date fields to ISO format', () => {
  const input = [
    'CREATE PROCEDURE dbo.date_field_normalization()',
    '-- METADATA',
    '--',
    '-- Description : Existing description',
    '-- Version     : 1.0',
    '-- Author      : Existing Author',
    '-- Created     : 20.08.2025',
    '-- Updated     : 21.08.2025',
    '--',
    '-- History     :',
    '--   v1.0: Initial creation - 20.08.2025 Existing Author',
    '--',
    '-- METADATA END',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Created     : 2025-08-20'));
  assert.ok(result.text.includes('-- Updated     : 2026-06-09'));
  assert.ok(result.text.includes('--   v1.0: Initial creation - 2025-08-20 Existing Author'));
  assert.equal(result.text.includes('20.08.2025'), false);
});

runTest('normalizes valid legacy date values while preserving unknown placeholders', () => {
  const input = [
    'CREATE PROCEDURE dbo.legacy_date_normalization()',
    '/ -------------------------',
    '/ description: Legacy date normalization',
    '/ version: 1.0',
    '/ erstellt Datum: 20.08.2025      erstellt von: Legacy Author',
    '/ letzte Änderung: xx.xx.xxxx',
    '/ history:',
    '/ v1.0 - erstellt am 20.08.2025',
    '/ -------------------------',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Created     : 2025-08-20'));
  assert.ok(result.text.includes('-- Updated     : 2026-06-09'));
  assert.ok(result.text.includes('--   v1.0: erstellt am 2025-08-20'));
  assert.equal(result.text.includes('20.08.2025'), false);
});

runTest('reports missing metadata only for objects without a current or normalizable legacy header', () => {
  const input = [
    'CREATE PROCEDURE dbo.legacy_header()',
    '-- -------------------------',
    '-- description: Legacy header',
    '-- version: 1.0',
    '-- history:',
    '-- v1.0 - initial creation',
    '-- -------------------------',
    'BEGIN',
    'SELECT 1;',
    'END;',
    '',
    'CREATE FUNCTION dbo.missing_header() RETURNS integer',
    'BEGIN',
    'RETURN 2;',
    'END;'
  ].join('\n');

  const issues = findMissingMetadataHeaderIssues(input, watcomDialect);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].object.name, 'dbo.missing_header');
});

function countOccurrences(text, needle) {
  return text.split(/\r?\n/).filter((line) => line.trim() === needle).length;
}

function assertInObjectSection(text, objectName, expectedText) {
  const section = getObjectSection(text, objectName);
  assert.ok(section.includes(expectedText), `${objectName} should include ${expectedText}`);
}

function getObjectSection(text, objectName) {
  const objectIndex = text.indexOf(objectName);
  assert.notEqual(objectIndex, -1, `${objectName} should exist in the script`);

  const nextCreateIndex = text.slice(objectIndex + objectName.length).search(/\bCREATE\b/i);
  return nextCreateIndex < 0
    ? text.slice(objectIndex)
    : text.slice(objectIndex, objectIndex + objectName.length + nextCreateIndex);
}
