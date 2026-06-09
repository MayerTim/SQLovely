import * as vscode from 'vscode';

import { getActiveDialect, getExtrasConfiguration, getFormatConfiguration } from '../config';
import { SQL_LANGUAGE_ID } from '../constants';
import { formatSqlDocument } from './formatSqlDocument';

export function registerSqlovelyDocumentFormattingProvider(): vscode.Disposable {
  return vscode.languages.registerDocumentFormattingEditProvider(SQL_LANGUAGE_ID, {
    provideDocumentFormattingEdits(document) {
      const formatConfiguration = getFormatConfiguration(document.uri);

      if (!formatConfiguration.enabled) {
        return [];
      }

      const extrasConfiguration = getExtrasConfiguration(document.uri);
      const originalText = document.getText();
      const result = formatSqlDocument(originalText, getActiveDialect(document.uri), {
        keywordCase: formatConfiguration.keywordCase,
        indentSize: formatConfiguration.indentSize,
        insertSpaces: formatConfiguration.insertSpaces,
        maxConsecutiveBlankLines: formatConfiguration.maxConsecutiveBlankLines,
        ensureFinalNewline: formatConfiguration.ensureFinalNewline,
        applyExtrasWithFormatting: extrasConfiguration.enabled && extrasConfiguration.applyWithFormatting,
        metadataHeaderEnabled: extrasConfiguration.metadataHeader.enabled
      });

      if (!result.changed) {
        return [];
      }

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(originalText.length)
      );

      return [vscode.TextEdit.replace(fullRange, result.text)];
    }
  });
}
