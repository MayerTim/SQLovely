import * as vscode from 'vscode';

import { registerApplySqlovelyExtrasCommand } from './applyExtras';
import { registerFormatCurrentFileCommand } from './formatCurrentFile';
import { registerFormatSqlFilesInDirectoryCommand } from './formatSqlFilesInDirectory';
import { registerInsertOrUpdateMetadataHeaderCommand } from './insertOrUpdateMetadataHeader';
import { registerShowActiveDialectCommand } from './showActiveDialect';
import { registerSwitchDialectCommand } from './switchDialect';

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerShowActiveDialectCommand(),
    registerSwitchDialectCommand(),
    registerFormatCurrentFileCommand(),
    registerFormatSqlFilesInDirectoryCommand(),
    registerInsertOrUpdateMetadataHeaderCommand(),
    registerApplySqlovelyExtrasCommand()
  );
}
