const fs = require('fs');
const path = require('path');
const { assert, runTest } = require('./helpers/runTest');

const {
  applyExtras,
  insertOrUpdateMetadataHeader,
  METADATA_HEADER_END,
  METADATA_HEADER_START
} = require('../dist/extras');
const { watcomDialect } = require('../dist/dialects/watcom/dialect');
const { mssqlDialect } = require('../dist/dialects/mssql/dialect');
const { detectPrimarySqlObject } = require('../dist/extras/objectDetection');

const fixedDate = new Date('2026-06-09T12:00:00.000Z');
const options = { now: fixedDate, author: 'Test Author' };

function readFixture(relativePath) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', relativePath), 'utf8');
}

runTest('inserts a metadata header for a Watcom procedure', () => {
  const input = 'CREATE PROCEDURE dbo.my_proc()\nBEGIN\nEND;\n';
  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'inserted');
  assert.ok(result.text.startsWith('CREATE PROCEDURE dbo.my_proc()\n-- METADATA'));
  assert.ok(result.text.includes(`${METADATA_HEADER_END}\nBEGIN\nEND;`));
  assert.ok(result.text.includes('-- Description : <TODO>'));
  assert.ok(result.text.includes('-- Version     : 1.0'));
  assert.ok(result.text.includes('-- Author      : Test Author'));
  assert.ok(result.text.includes('-- Created     : 2026-06-09'));
  assert.ok(result.text.includes('-- Updated     : 2026-06-09'));
  assert.ok(result.text.includes('-- History     :'));
  assert.ok(result.text.includes('--   v1.0: Initial creation - 2026-06-09 Test Author'));
  
});

runTest('does not duplicate an already current metadata header', () => {
  const input = 'CREATE FUNCTION my_func() RETURNS integer\nBEGIN\nRETURN 1;\nEND;\n';
  const first = insertOrUpdateMetadataHeader(input, watcomDialect, options);
  const second = insertOrUpdateMetadataHeader(first.text, watcomDialect, options);

  assert.equal(first.action, 'inserted');
  assert.equal(second.action, 'unchanged');
  assert.equal(second.text, first.text);
  assert.equal(countOccurrences(second.text, METADATA_HEADER_START), 1);
  assert.equal(countOccurrences(second.text, METADATA_HEADER_END), 1);
});

runTest('updates an existing header while preserving created date and description', () => {
  const input = [
    'CREATE PROCEDURE new_name()',
    'BEGIN',
    '  -- METADATA',
    '  --',
    '  -- Description : Existing description',
    '  -- Version     : 2.0',
    '  -- Author      : Existing Author',
    '  -- Created     : 2020-01-02',
    '  -- Updated     : 2020-01-03',
    '  --',
    '  -- History     :',
    '  --   v2.0: Existing history - 2020-01-02 Existing Author',
    '  --',
    '  -- METADATA END',
    '',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Description : Existing description'));
  assert.ok(result.text.includes('-- Version     : 2.0'));
  assert.ok(result.text.includes('-- Author      : Existing Author'));
  assert.ok(result.text.includes('-- Created     : 2020-01-02'));
  assert.ok(result.text.includes('-- Updated     : 2026-06-09'));
  assert.ok(result.text.includes('--   v2.0: Existing history - 2020-01-02 Existing Author'));
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
});

runTest('updates metadata version when a newer valid history entry exists', () => {
  const input = [
    'CREATE PROCEDURE dbo.history_added()',
    'BEGIN',
    '  -- METADATA',
    '  --',
    '  -- Description : Existing description',
    '  -- Version     : 1.0',
    '  -- Author      : Existing Author',
    '  -- Created     : 2020-01-02',
    '  -- Updated     : 2020-01-03',
    '  --',
    '  -- History     :',
    '  --   v1.0: Initial creation - 2020-01-02 Existing Author',
    '  --   v1.1: Added validation - 2020-02-03 Existing Author',
    '  --',
    '  -- METADATA END',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Version     : 1.1'));
  assert.ok(result.text.includes('--   v1.0: Initial creation - 2020-01-02 Existing Author'));
  assert.ok(result.text.includes('--   v1.1: Added validation - 2020-02-03 Existing Author'));
});

runTest('adds a history entry when the metadata version was bumped', () => {
  const input = [
    'CREATE PROCEDURE dbo.version_bumped()',
    'BEGIN',
    '  -- METADATA',
    '  --',
    '  -- Description : Existing description',
    '  -- Version     : 2.0',
    '  -- Author      : Existing Author',
    '  -- Created     : 2020-01-02',
    '  -- Updated     : 2020-01-03',
    '  --',
    '  -- History     :',
    '  --   v1.0: Initial creation - 2020-01-02 Existing Author',
    '  --',
    '  -- METADATA END',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Version     : 2.0'));
  assert.ok(result.text.includes('--   v1.0: Initial creation - 2020-01-02 Existing Author'));
  assert.ok(result.text.includes('--   v2.0: <TODO> - 2026-06-09 Existing Author'));
});

runTest('corrects invalid metadata version bumps before adding history entries', () => {
  const input = [
    'CREATE PROCEDURE dbo.invalid_version_bump()',
    'BEGIN',
    '  -- METADATA',
    '  --',
    '  -- Description : Existing description',
    '  -- Version     : 1.5',
    '  -- Author      : Existing Author',
    '  -- Created     : 2020-01-02',
    '  -- Updated     : 2020-01-03',
    '  --',
    '  -- History     :',
    '  --   v1.0: Initial creation - 2020-01-02 Existing Author',
    '  --',
    '  -- METADATA END',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Version     : 1.1'));
  assert.ok(result.text.includes('--   v1.1: <TODO> - 2026-06-09 Existing Author'));
  assert.equal(result.text.includes('-- Version     : 1.5'), false);
  assert.equal(result.text.includes('--   v1.5:'), false);
});

runTest('corrects invalid history version jumps to one-step increments', () => {
  const cases = [
    { requestedVersion: '3.0', expectedVersion: '2.0' },
    { requestedVersion: '1.5', expectedVersion: '1.1' },
    { requestedVersion: '1.0.3', expectedVersion: '1.0.1' }
  ];

  for (const testCase of cases) {
    const input = [
      'CREATE PROCEDURE dbo.invalid_history()',
      'BEGIN',
      '  -- METADATA',
      '  --',
      '  -- Description : Existing description',
      `  -- Version     : ${testCase.requestedVersion}`,
      '  -- Author      : Existing Author',
      '  -- Created     : 2020-01-02',
      '  -- Updated     : 2020-01-03',
      '  --',
      '  -- History     :',
      '  --   v1.0: Initial creation - 2020-01-02 Existing Author',
      `  --   v${testCase.requestedVersion}: Changed implementation - 2020-02-03 Existing Author`,
      '  --',
      '  -- METADATA END',
      'END;'
    ].join('\n');

    const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

    assert.equal(result.action, 'updated');
    assert.ok(result.text.includes(`-- Version     : ${testCase.expectedVersion}`));
    assert.ok(result.text.includes(`--   v${testCase.expectedVersion}: Changed implementation - 2020-02-03 Existing Author`));
    assert.equal(result.text.includes(`--   v${testCase.requestedVersion}: Changed implementation`), false);
  }
});

runTest('ignores object declarations inside comments and string literals', () => {
  const input = [
    '-- CREATE PROCEDURE fake_proc()',
    "SELECT 'CREATE FUNCTION fake_func()';",
    '/* CREATE TRIGGER fake_trigger */',
    'CREATE FUNCTION real_func() RETURNS integer',
    'BEGIN',
    'RETURN 1;',
    'END;'
  ].join('\n');

  const detected = detectPrimarySqlObject(input, watcomDialect);

  assert.deepEqual(detected, {
    type: 'function',
    name: 'real_func',
    index: input.indexOf('CREATE FUNCTION real_func')
  });
});

runTest('detects the first real supported SQL object in declaration order', () => {
  const input = [
    'CREATE TRIGGER trg_before',
    'BEGIN',
    'END;',
    '',
    'CREATE PROCEDURE proc_after()',
    'BEGIN',
    'END;'
  ].join('\n');

  const detected = detectPrimarySqlObject(input, watcomDialect);

  assert.deepEqual(detected, {
    type: 'trigger',
    name: 'trg_before',
    index: 0
  });
});

runTest('skips files without supported SQL object declarations', () => {
  const input = 'SELECT 1;\n';
  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'skipped');
  assert.equal(result.text, input);
});

runTest('detects MSSQL CREATE OR ALTER procedure declarations', () => {
  const input = 'CREATE OR ALTER PROC [dbo].[my_proc]\nAS\nBEGIN\nSELECT 1;\nEND;\n';
  const result = insertOrUpdateMetadataHeader(input, mssqlDialect, options);

  assert.equal(result.action, 'inserted');
  assert.ok(result.text.includes('-- METADATA'));
  assert.ok(result.text.includes('-- Description : <TODO>'));
  assert.ok(result.text.includes('-- Author      : Test Author'));
});

runTest('normalizes double-quoted object name parts', () => {
  const input = 'CREATE PROCEDURE "dbo"."quoted_proc"()\nBEGIN\nEND;\n';
  const detected = detectPrimarySqlObject(input, watcomDialect);

  assert.equal(detected?.type, 'procedure');
  assert.equal(detected?.name, 'dbo.quoted_proc');
});

runTest('preserves BOM and CRLF line endings when inserting a header', () => {
  const input = '\ufeffCREATE PROCEDURE dbo.crlf_proc()\r\nBEGIN\r\nEND;\r\n';
  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'inserted');
  assert.ok(result.text.startsWith('\ufeffCREATE PROCEDURE dbo.crlf_proc()\r\n-- METADATA\r\n'));
  assert.ok(result.text.includes(`${METADATA_HEADER_END}\r\nBEGIN\r\nEND;`));
  assert.ok(!result.text.includes('\nCREATE PROCEDURE dbo.crlf_proc()') || result.text.includes('\r\nCREATE PROCEDURE dbo.crlf_proc()'));
});

runTest('applies SQLovely extras through the extra pipeline', () => {
  const input = 'CREATE TRIGGER trg_test\nBEGIN\nEND;\n';
  const result = applyExtras(input, watcomDialect, options);

  assert.equal(result.changed, true);
  assert.equal(result.metadataHeader.action, 'inserted');
  assert.ok(result.text.includes('-- METADATA'));
  assert.ok(result.text.includes('-- Description : <TODO>'));
});

runTest('can disable metadata headers in the SQLovely extra pipeline', () => {
  const input = 'CREATE PROCEDURE dbo.my_proc()\nBEGIN\nEND;\n';
  const result = applyExtras(input, watcomDialect, {
    ...options,
    metadataHeaderEnabled: false
  });

  assert.equal(result.changed, false);
  assert.equal(result.text, input);
  assert.equal(result.metadataHeader.action, 'skipped');
  assert.equal(result.metadataHeader.reason, 'Metadata header extra is disabled.');
});

runTest('metadata header generation works with fixture-based SQL input', () => {
  const input = readFixture('extras/watcom/header.input.sql');
  const result = applyExtras(input, watcomDialect, options);

  assert.equal(result.changed, true);
  assert.equal(result.metadataHeader.action, 'inserted');
  assert.ok(result.text.includes('-- METADATA'));
  assert.ok(result.text.includes('-- Description : <TODO>'));
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
});


runTest('detects rudimentary MSSQL bracketed and temporary procedure names', () => {
  const bracketedInput = 'CREATE OR ALTER PROCEDURE [dbo].[my proc]]name]\nAS\nBEGIN\nSELECT 1;\nEND;\n';
  const bracketed = detectPrimarySqlObject(bracketedInput, mssqlDialect);

  assert.equal(bracketed?.type, 'procedure');
  assert.equal(bracketed?.name, 'dbo.my proc]name');

  const tempInput = 'CREATE PROC #sqlovely_temp_proc\nAS\nSELECT 1;\n';
  const temporary = detectPrimarySqlObject(tempInput, mssqlDialect);

  assert.equal(temporary?.type, 'procedure');
  assert.equal(temporary?.name, '#sqlovely_temp_proc');
});

runTest('detects rudimentary MSSQL triggers and scalar functions', () => {
  const triggerInput = 'CREATE TRIGGER [dbo].[trg_Audit] ON [dbo].[T] AFTER INSERT AS SELECT 1;\n';
  const trigger = detectPrimarySqlObject(triggerInput, mssqlDialect);

  assert.equal(trigger?.type, 'trigger');
  assert.equal(trigger?.name, 'dbo.trg_Audit');

  const functionInput = 'CREATE OR ALTER FUNCTION [dbo].[ufn_value]() RETURNS int AS BEGIN RETURN 1 END;\n';
  const func = detectPrimarySqlObject(functionInput, mssqlDialect);

  assert.equal(func?.type, 'function');
  assert.equal(func?.name, 'dbo.ufn_value');
});


runTest('migrates legacy top-level metadata headers before the SQL object BEGIN', () => {
  const input = [
    '-- SQLovely-Metadata-Start',
    '-- Author      : Legacy Author',
    '-- Created     : 2020-01-02',
    '-- Description : Legacy description',
    '-- SQLovely-Metadata-End',
    '',
    'CREATE PROCEDURE dbo.legacy_proc()',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.startsWith('CREATE PROCEDURE dbo.legacy_proc()\n-- METADATA'));
  assert.ok(result.text.includes(`${METADATA_HEADER_END}\nBEGIN\nSELECT 1;`));
  assert.ok(result.text.includes('-- Author      : Legacy Author'));
  assert.ok(result.text.includes('-- Created     : 2020-01-02'));
  assert.ok(result.text.includes('-- Description : Legacy description'));
  assert.ok(!result.text.includes('SQLovely-Metadata-Start'));
});


runTest('normalizes a loose legacy Watcom metadata header before BEGIN', () => {
  const input = [
    'create or replace procedure "fct"."procedurename"',
    '( in "parameter1" integer,in "parameter2" integer )',
    '-- ---------------------------------------------------------------------------',
    '--                     procedurename',
    '-- ---------------------------------------------------------------------------',
    '--',
    '-- beschreibung',
    '--',
    '-- version:             1.00',
    '-- erstellt Datum:      xx.xx.xxxx      erstellt von: t.mayer',
    '-- letzte Änderung:',
    '--',
    '-- ---------------------------------------------------------------------------',
    '-- history:',
    '-- v1.00 - erstellt',
    '-- ---------------------------------------------------------------------------',
    'begin',
    '  -- do something',
    'end;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('create or replace procedure "fct"."procedurename"\n( in "parameter1" integer,in "parameter2" integer )\n-- METADATA'));
  assert.ok(result.text.includes('-- Description : <TODO>'));
  assert.ok(result.text.includes('-- Version     : 1.00'));
  assert.ok(result.text.includes('-- Author      : t.mayer'));
  assert.ok(result.text.includes('-- Created     : xx.xx.xxxx'));
  assert.ok(result.text.includes('-- Updated     : 2026-06-09'));
  assert.ok(result.text.includes('--   v1.00: erstellt'));
  assert.ok(result.text.includes(`${METADATA_HEADER_END}\nbegin`));
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
  assert.equal(result.text.includes('-- version:'), false);
  assert.equal(result.text.includes('-- history:'), false);
});

runTest('normalizes slash-style legacy metadata headers with labelled descriptions', () => {
  const input = [
    'CREATE FUNCTION dbo.slash_header() RETURNS integer',
    '// ////////////////////////////////////////',
    '// Description: Calculates the demo value',
    '// Version = v2.4',
    '// Created: 2021-03-04',
    '// Author: Legacy Author',
    '// History:',
    '// v2.4 - migrated from old template',
    '// ////////////////////////////////////////',
    'BEGIN',
    'RETURN 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.ok(result.text.includes('-- Description : Calculates the demo value'));
  assert.ok(result.text.includes('-- Version     : 2.4'));
  assert.ok(result.text.includes('-- Author      : Legacy Author'));
  assert.ok(result.text.includes('-- Created     : 2021-03-04'));
  assert.ok(result.text.includes('--   v2.4: migrated from old template'));
  assert.ok(!result.text.includes('// Version'));
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
});

runTest('leaves non-metadata comment blocks in place while inserting a new header', () => {
  const input = [
    'CREATE PROCEDURE dbo.comment_only()',
    '-- This comment explains the procedure body.',
    '-- It is not a legacy metadata header.',
    'BEGIN',
    'SELECT 1;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'inserted');
  assert.ok(result.text.includes('-- This comment explains the procedure body.'));
  assert.ok(result.text.includes('-- Version     : 1.0'));
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 1);
});


runTest('inserts metadata headers for every supported SQL object in a script', () => {
  const input = [
    'CREATE PROCEDURE dbo.first_proc()',
    'BEGIN',
    'SELECT 1;',
    'END;',
    '',
    'CREATE FUNCTION dbo.second_func() RETURNS integer',
    'BEGIN',
    'RETURN 2;',
    'END;',
    '',
    'CREATE TRIGGER dbo.third_trigger',
    'BEGIN',
    'SELECT 3;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'inserted');
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 3);
  assert.equal(countOccurrences(result.text, METADATA_HEADER_END), 3);
  assert.ok(result.text.includes('CREATE PROCEDURE dbo.first_proc()\n-- METADATA'));
  assert.ok(result.text.includes('CREATE FUNCTION dbo.second_func() RETURNS integer\n-- METADATA'));
  assert.ok(result.text.includes('CREATE TRIGGER dbo.third_trigger\n-- METADATA'));
});

runTest('normalizes legacy metadata headers independently for multiple objects', () => {
  const input = [
    'CREATE PROCEDURE dbo.first_proc()',
    '-- -------------------------',
    '-- description: First legacy header',
    '-- version: 1.0',
    '-- author: First Author',
    '-- history:',
    '-- v1.0 - first created',
    '-- -------------------------',
    'BEGIN',
    'SELECT 1;',
    'END;',
    '',
    'CREATE FUNCTION dbo.second_func() RETURNS integer',
    '// /////////////////////////',
    '// description: Second legacy header',
    '// version: 2.0',
    '// author: Second Author',
    '// history:',
    '// v2.0 - second created',
    '// /////////////////////////',
    'BEGIN',
    'RETURN 2;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'updated');
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 2);
  assert.ok(result.text.includes('-- Description : First legacy header'));
  assert.ok(result.text.includes('-- Author      : First Author'));
  assert.ok(result.text.includes('--   v1.0: first created'));
  assert.ok(result.text.includes('-- Description : Second legacy header'));
  assert.ok(result.text.includes('-- Author      : Second Author'));
  assert.ok(result.text.includes('--   v2.0: second created'));
  assert.equal(result.text.includes('// version'), false);
});

runTest('keeps existing metadata headers scoped to their own SQL objects', () => {
  const input = [
    'CREATE PROCEDURE dbo.first_proc()',
    'BEGIN',
    'SELECT 1;',
    'END;',
    '',
    'CREATE PROCEDURE dbo.second_proc()',
    '-- METADATA',
    '--',
    '-- Description : Existing second header',
    '-- Version     : 1.0',
    '-- Author      : Existing Author',
    '-- Created     : 2020-01-02',
    '-- Updated     : 2020-01-03',
    '--',
    '-- History     :',
    '--   v1.0: Existing second history - 2020-01-02 Existing Author',
    '--',
    '-- METADATA END',
    'BEGIN',
    'SELECT 2;',
    'END;'
  ].join('\n');

  const result = insertOrUpdateMetadataHeader(input, watcomDialect, options);

  assert.equal(result.action, 'inserted');
  assert.equal(countOccurrences(result.text, METADATA_HEADER_START), 2);
  assert.ok(result.text.includes('CREATE PROCEDURE dbo.first_proc()\n-- METADATA'));
  assert.ok(result.text.includes('-- Description : Existing second header'));
  assert.ok(result.text.includes('-- Author      : Existing Author'));
  assert.ok(result.text.includes('-- Created     : 2020-01-02'));
});

function countOccurrences(text, needle) {
  return text.split(/\r?\n/).filter((line) => line.trim() === needle).length;
}
