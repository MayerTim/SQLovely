import * as vscode from 'vscode';

import { registerCommands } from './commands';
import { registerSqlovelyCodeActionProviders } from './codeActions';
import { getActiveDialect } from './config';
import { registerSqlovelyExtrasOnSave } from './extras/onSaveExtras';
import { registerSqlovelyDiagnostics } from './diagnostics';
import { registerSqlovelyDocumentFormattingProvider } from './formatter/documentFormattingProvider';
import { getActiveSqlDocumentUri } from './editor/activeSqlEditor';
import { createOutputChannel, logActivation } from './logging';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = createOutputChannel();
  context.subscriptions.push(outputChannel);

  logActivation(outputChannel, context);
  registerCommands(context);
  context.subscriptions.push(registerSqlovelyDocumentFormattingProvider());
  context.subscriptions.push(registerSqlovelyExtrasOnSave());
  context.subscriptions.push(registerSqlovelyCodeActionProviders());
  registerSqlovelyDiagnostics(context);

  const activeDialect = getActiveDialect(getActiveSqlDocumentUri());
  outputChannel.appendLine(`Active dialect: ${activeDialect.displayName} (${activeDialect.id}).`);
}

export function deactivate(): void {
}
