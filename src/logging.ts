import * as vscode from 'vscode';

import { EXTENSION_NAME } from './constants';

let outputChannel: vscode.OutputChannel | undefined;

export function createOutputChannel(): vscode.OutputChannel {
  return getSqlovelyOutputChannel();
}

export function getSqlovelyOutputChannel(): vscode.OutputChannel {
  outputChannel ??= vscode.window.createOutputChannel(EXTENSION_NAME);
  return outputChannel;
}

export function logActivation(
  channel: vscode.OutputChannel,
  context: vscode.ExtensionContext,
): void {
  const extensionVersion = context.extension.packageJSON.version as string | undefined;
  const versionText = extensionVersion ? ` v${extensionVersion}` : '';

  channel.appendLine(`${EXTENSION_NAME}${versionText} activated.`);
}

export function logFormattingSafetySummary(
  summary: string | undefined,
  resourceLabel?: string,
): void {
  if (!summary) {
    return;
  }

  const location = resourceLabel ? ` for ${resourceLabel}` : '';
  getSqlovelyOutputChannel().appendLine(`Formatter safety guard${location}: ${summary}.`);
}
