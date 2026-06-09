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

function countOccurrences(text, needle) {
  return text.split(/\r?\n/).filter((line) => line.trim() === needle).length;
}
