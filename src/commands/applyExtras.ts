import * as vscode from 'vscode';

import { COMMANDS } from '../constants';
import { getActiveDialect, getExtrasConfiguration } from '../config';
import { applyExtras } from '../extras';
import { requireActiveSqlEditorContext } from '../editor/activeSqlEditor';
import { replaceDocumentText } from '../editor/replaceDocumentText';
import { getDefaultAuthorName } from '../utils/defaultAuthor';

export function registerApplySqlovelyExtrasCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMANDS.applyExtras, async () => {
    const activeContext = requireActiveSqlEditorContext('SQLovely: Apply SQLovely Extras');

    if (!activeContext) {
      return;
    }

    const extraConfiguration = getExtrasConfiguration(activeContext.resource);

    if (!extraConfiguration.enabled) {
      await vscode.window.showInformationMessage('SQLovely extras are disabled by sqlovely.extras.enabled.');
      return;
    }

    if (!extraConfiguration.metadataHeader.enabled) {
      await vscode.window.showInformationMessage('SQLovely metadata headers are disabled by sqlovely.extras.metadataHeader.enabled.');
      return;
    }

    const dialect = getActiveDialect(activeContext.resource);
    const originalText = activeContext.document.getText();
    const result = applyExtras(originalText, dialect, {
      author: getDefaultAuthorName(),
      metadataHeaderEnabled: extraConfiguration.metadataHeader.enabled
    });

    if (!result.changed) {
      if (result.metadataHeader.action === 'skipped') {
        await vscode.window.showWarningMessage(
          result.metadataHeader.reason ?? 'SQLovely did not find any applicable SQLovely extras for this file.'
        );
        return;
      }

      await vscode.window.showInformationMessage('SQLovely extras are already up to date.');
      return;
    }

    const applied = await replaceDocumentText(activeContext.editor, originalText, result.text);

    if (!applied) {
      await vscode.window.showErrorMessage('SQLovely could not update the active SQL document.');
      return;
    }

    const objectDescription = result.metadataHeader.object
      ? `${result.metadataHeader.object.type} ${result.metadataHeader.object.name}`
      : 'SQL object';

    await vscode.window.showInformationMessage(
      `SQLovely extras applied for ${objectDescription}.`
    );
  });
}
