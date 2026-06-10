const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');

const vscode = require('vscode');

const MISSING_METADATA_HEADER_DIAGNOSTIC_CODE = 'sqlovely.missingMetadataHeader';
const SQL_OVELY_DIAGNOSTIC_SOURCE = 'SQLovely';

async function runDiagnosticsSmokeTest() {
  const extension = vscode.extensions.getExtension('MayerTim.sqlovely');
  assert.ok(extension, 'SQLovely extension should be available in the extension host');
  await extension.activate();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, 'extension smoke test should run with a workspace folder');

  const sqlFilePath = path.join(workspaceFolder.uri.fsPath, 'diagnostics-smoke.sql');
  const sqlFileUri = vscode.Uri.file(sqlFilePath);

  await fs.writeFile(
    sqlFilePath,
    ['CREATE PROCEDURE dbo.needs_header()', 'BEGIN', 'END;'].join('\n'),
    'utf8',
  );

  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update('dialect', 'watcom', vscode.ConfigurationTarget.Workspace);
  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update('diagnostics.enabled', true, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update(
      'diagnostics.missingMetadataHeader.enabled',
      true,
      vscode.ConfigurationTarget.Workspace,
    );
  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update('extras.enabled', true, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update('extras.metadataHeader.enabled', true, vscode.ConfigurationTarget.Workspace);

  const document = await vscode.workspace.openTextDocument(sqlFileUri);
  await vscode.window.showTextDocument(document);

  assert.equal(document.languageId, 'sql');

  const diagnostics = await waitForDiagnostics(sqlFileUri, (currentDiagnostics) =>
    currentDiagnostics.some(isMissingMetadataHeaderDiagnostic),
  );
  const missingHeaderDiagnostic = diagnostics.find(isMissingMetadataHeaderDiagnostic);

  assert.ok(missingHeaderDiagnostic, 'missing metadata diagnostic should be published');
  assert.equal(missingHeaderDiagnostic.severity, vscode.DiagnosticSeverity.Warning);
  assert.match(
    missingHeaderDiagnostic.message,
    /SQLovely metadata header is missing for procedure dbo\.needs_header\./u,
  );
  assert.equal(missingHeaderDiagnostic.range.start.line, 0);
  assert.equal(missingHeaderDiagnostic.range.start.character, 0);

  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

async function waitForDiagnostics(uri, predicate) {
  const timeoutMs = 5000;
  const intervalMs = 100;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const diagnostics = vscode.languages.getDiagnostics(uri);

    if (predicate(diagnostics)) {
      return diagnostics;
    }

    await delay(intervalMs);
  }

  assert.fail(
    `timed out waiting for SQLovely diagnostics for ${uri.toString()}: ${JSON.stringify(
      vscode.languages.getDiagnostics(uri).map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        source: diagnostic.source,
      })),
    )}`,
  );
}

function isMissingMetadataHeaderDiagnostic(diagnostic) {
  return (
    diagnostic.source === SQL_OVELY_DIAGNOSTIC_SOURCE &&
    diagnostic.code === MISSING_METADATA_HEADER_DIAGNOSTIC_CODE
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = { runDiagnosticsSmokeTest };
