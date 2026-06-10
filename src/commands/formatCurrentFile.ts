import * as vscode from 'vscode';

import { COMMANDS } from '../constants';
import { getActiveDialect, getDiagnosticsConfiguration, getExtrasConfiguration, getFormatConfiguration } from '../config';
import { requireActiveSqlEditorContext } from '../editor/activeSqlEditor';
import { replaceDocumentText } from '../editor/replaceDocumentText';
import { formatSqlDocument } from '../formatter';
import { logFormattingSafetySummary } from '../logging';

export function registerFormatCurrentFileCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMANDS.formatCurrentFile, async () => {
    const activeContext = requireActiveSqlEditorContext('SQLovely: Format Current SQL File');

    if (!activeContext) {
      return;
    }

    const formatConfiguration = getFormatConfiguration(activeContext.resource);

    if (!formatConfiguration.enabled) {
      await vscode.window.showInformationMessage('SQLovely formatting is disabled by sqlovely.format.enabled.');
      return;
    }

    const extrasConfiguration = getExtrasConfiguration(activeContext.resource);
    const diagnosticsConfiguration = getDiagnosticsConfiguration(activeContext.resource);
    const originalText = activeContext.editor.document.getText();
    const result = formatSqlDocument(originalText, getActiveDialect(activeContext.resource), {
      keywordCase: formatConfiguration.keywordCase,
      indentSize: formatConfiguration.indentSize,
      insertSpaces: formatConfiguration.insertSpaces,
      maxConsecutiveBlankLines: formatConfiguration.maxConsecutiveBlankLines,
      ensureFinalNewline: formatConfiguration.ensureFinalNewline,
      safetyLimits: formatConfiguration.safetyLimits,
      applyExtrasWithFormatting: extrasConfiguration.enabled && extrasConfiguration.applyWithFormatting,
      metadataHeaderEnabled: extrasConfiguration.metadataHeader.enabled,
      maxLineLength: diagnosticsConfiguration.maxLineLength.limit
    });

    logFormattingSafetySummary(result.formatting.safetySummary, vscode.workspace.asRelativePath(activeContext.resource, false));

    if (!result.changed) {
      await vscode.window.showInformationMessage('SQLovely: No formatting or extra changes needed.');
      return;
    }

    const changed = await replaceDocumentText(activeContext.editor, originalText, result.text);

    if (changed) {
      await vscode.window.showInformationMessage('SQLovely: Current SQL file formatted.');
    }
  });
}
