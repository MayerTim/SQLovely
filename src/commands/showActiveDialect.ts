import * as vscode from 'vscode';

import { COMMANDS } from '../constants';
import { getActiveDialect } from '../config';
import { getActiveSqlDocumentUri } from '../editor/activeSqlEditor';

export function registerShowActiveDialectCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMANDS.showActiveDialect, () => {
    const resource = getActiveSqlDocumentUri();
    const dialect = getActiveDialect(resource);

    void vscode.window.showInformationMessage(
      `SQLovely dialect: ${dialect.displayName} (${dialect.id})`,
    );
  });
}
