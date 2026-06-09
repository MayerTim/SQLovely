import * as vscode from 'vscode';

import { EXTENSION_NAME } from './constants';

export function createOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(EXTENSION_NAME);
}

export function logActivation(
  outputChannel: vscode.OutputChannel,
  context: vscode.ExtensionContext
): void {
  const extensionVersion = context.extension.packageJSON.version as string | undefined;
  const versionText = extensionVersion ? ` v${extensionVersion}` : '';

  outputChannel.appendLine(`${EXTENSION_NAME}${versionText} activated.`);
}
