import * as vscode from 'vscode';

import { getActiveDialect, getDiagnosticsConfiguration, getExtrasConfiguration } from '../config';
import { SQL_LANGUAGE_ID } from '../constants';
import { getDefaultAuthorName } from '../utils/defaultAuthor';
import { applyExtras } from './applyExtras';

export function registerSqlovelyExtrasOnSave(): vscode.Disposable {
  return vscode.workspace.onWillSaveTextDocument((event) => {
    const edits = createExtraSaveEdits(event.document);

    if (edits.length > 0) {
      event.waitUntil(Promise.resolve(edits));
    }
  });
}

function createExtraSaveEdits(document: vscode.TextDocument): vscode.TextEdit[] {
  if (document.languageId !== SQL_LANGUAGE_ID) {
    return [];
  }

  const extraConfiguration = getExtrasConfiguration(document.uri);

  if (
    !extraConfiguration.enabled ||
    !extraConfiguration.applyOnSave ||
    !extraConfiguration.metadataHeader.enabled
  ) {
    return [];
  }

  const diagnosticsConfiguration = getDiagnosticsConfiguration(document.uri);
  const originalText = document.getText();
  const result = applyExtras(originalText, getActiveDialect(document.uri), {
    author: getDefaultAuthorName(),
    metadataHeaderEnabled: extraConfiguration.metadataHeader.enabled,
    maxLineLength: diagnosticsConfiguration.maxLineLength.limit
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
