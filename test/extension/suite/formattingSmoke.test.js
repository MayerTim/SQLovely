const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');

const vscode = require('vscode');

async function runFormattingSmokeTest() {
  const extension = vscode.extensions.getExtension('MayerTim.sqlovely');
  assert.ok(extension, 'SQLovely extension should be available in the extension host');
  await extension.activate();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, 'extension smoke test should run with a workspace folder');

  const sqlFilePath = path.join(workspaceFolder.uri.fsPath, 'formatting-smoke.sql');
  const sqlFileUri = vscode.Uri.file(sqlFilePath);

  await fs.writeFile(
    sqlFilePath,
    'select id,name from customers where active=1 order by name',
    'utf8',
  );

  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update('dialect', 'watcom', vscode.ConfigurationTarget.Workspace);
  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update('format.enabled', true, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace
    .getConfiguration('sqlovely', sqlFileUri)
    .update('extras.applyWithFormatting', false, vscode.ConfigurationTarget.Workspace);

  const document = await vscode.workspace.openTextDocument(sqlFileUri);
  await vscode.window.showTextDocument(document);

  assert.equal(document.languageId, 'sql');

  const edits = await vscode.commands.executeCommand(
    'vscode.executeFormatDocumentProvider',
    sqlFileUri,
    { insertSpaces: true, tabSize: 2 },
  );

  assert.ok(Array.isArray(edits), 'document formatting provider should return edits');
  assert.ok(edits.length > 0, 'document formatting provider should return at least one edit');

  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.set(sqlFileUri, edits);

  assert.equal(await vscode.workspace.applyEdit(workspaceEdit), true);
  assert.equal(
    document.getText(),
    ['SELECT id, name', 'FROM customers', 'WHERE active=1', 'ORDER BY name', ''].join('\n'),
  );

  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

module.exports = { runFormattingSmokeTest };
