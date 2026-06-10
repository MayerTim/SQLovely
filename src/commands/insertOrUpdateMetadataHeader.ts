import * as vscode from 'vscode';

import { COMMANDS } from '../constants';
import { getActiveDialect, getDiagnosticsConfiguration, getExtrasConfiguration } from '../config';
import { insertOrUpdateMetadataHeader } from '../extras';
import { requireActiveSqlEditorContext } from '../editor/activeSqlEditor';
import { replaceDocumentText } from '../editor/replaceDocumentText';
import { getDefaultAuthorName } from '../utils/defaultAuthor';

export function registerInsertOrUpdateMetadataHeaderCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMANDS.insertOrUpdateMetadataHeader, async () => {
    const activeContext = requireActiveSqlEditorContext(
      'SQLovely: Insert or Update Metadata Header',
    );

    if (!activeContext) {
      return;
    }

    const extraConfiguration = getExtrasConfiguration(activeContext.resource);

    if (!extraConfiguration.enabled) {
      await vscode.window.showInformationMessage(
        'SQLovely extras are disabled by sqlovely.extras.enabled.',
      );
      return;
    }

    if (!extraConfiguration.metadataHeader.enabled) {
      await vscode.window.showInformationMessage(
        'SQLovely metadata headers are disabled by sqlovely.extras.metadataHeader.enabled.',
      );
      return;
    }

    const dialect = getActiveDialect(activeContext.resource);
    const diagnosticsConfiguration = getDiagnosticsConfiguration(activeContext.resource);
    const originalText = activeContext.document.getText();
    const result = insertOrUpdateMetadataHeader(originalText, dialect, {
      author: getDefaultAuthorName(),
      maxLineLength: diagnosticsConfiguration.maxLineLength.limit,
    });

    if (result.action === 'skipped') {
      await vscode.window.showWarningMessage(
        result.reason ?? 'SQLovely could not detect a supported SQL object declaration.',
      );
      return;
    }

    if (result.action === 'unchanged') {
      await vscode.window.showInformationMessage('SQLovely metadata header is already up to date.');
      return;
    }

    const applied = await replaceDocumentText(activeContext.editor, originalText, result.text);

    if (!applied) {
      await vscode.window.showErrorMessage('SQLovely could not update the active SQL document.');
      return;
    }

    const objectDescription = result.object
      ? `${result.object.type} ${result.object.name}`
      : 'SQL object';

    await vscode.window.showInformationMessage(
      `SQLovely metadata header ${result.action} for ${objectDescription}.`,
    );
  });
}
