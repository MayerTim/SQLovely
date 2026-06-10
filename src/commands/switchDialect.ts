import * as vscode from 'vscode';

import { COMMANDS } from '../constants';
import { getActiveDialect, updateConfiguredDialectId } from '../config';
import { getActiveSqlDocumentUri } from '../editor/activeSqlEditor';
import { DIALECT_ORDER, DIALECTS, type SqlDialectId } from '../dialects';

interface DialectQuickPickItem extends vscode.QuickPickItem {
  readonly dialectId: SqlDialectId;
}

export function registerSwitchDialectCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMANDS.switchDialect, async () => {
    const resource = getActiveSqlDocumentUri();
    const activeDialect = getActiveDialect(resource);

    const selected = await vscode.window.showQuickPick(
      createDialectQuickPickItems(activeDialect.id),
      {
        title: 'SQLovely: Switch Dialect',
        placeHolder: 'Select the SQL dialect for this workspace or workspace folder',
      },
    );

    if (!selected) {
      return;
    }

    await updateConfiguredDialectId(selected.dialectId, resource);

    const dialect = DIALECTS[selected.dialectId];
    void vscode.window.showInformationMessage(
      `SQLovely dialect set to ${dialect.displayName} (${dialect.id}).`,
    );
  });
}

function createDialectQuickPickItems(activeDialectId: SqlDialectId): DialectQuickPickItem[] {
  return DIALECT_ORDER.map((dialectId) => {
    const dialect = DIALECTS[dialectId];
    const isActive = dialectId === activeDialectId;

    return {
      dialectId,
      label: `${isActive ? '$(check) ' : ''}${dialect.displayName}`,
      description: dialect.id,
      detail: dialect.description,
    };
  });
}
