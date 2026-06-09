import * as vscode from 'vscode';

import { registerApplySqlovelyExtrasCommand } from './applyExtras';
import { registerFormatCurrentFileCommand } from './formatCurrentFile';
import { registerInsertOrUpdateMetadataHeaderCommand } from './insertOrUpdateMetadataHeader';
import { registerShowActiveDialectCommand } from './showActiveDialect';
import { registerSwitchDialectCommand } from './switchDialect';

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerShowActiveDialectCommand(),
    registerSwitchDialectCommand(),
    registerFormatCurrentFileCommand(),
    registerInsertOrUpdateMetadataHeaderCommand(),
    registerApplySqlovelyExtrasCommand()
  );
}
