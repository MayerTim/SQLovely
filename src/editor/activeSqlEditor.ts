import * as vscode from 'vscode';

import { SQL_LANGUAGE_ID } from '../constants';

export interface ActiveSqlEditorContext {
  readonly editor: vscode.TextEditor;
  readonly document: vscode.TextDocument;
  readonly resource: vscode.Uri;
}

export function getActiveSqlEditorContext(): ActiveSqlEditorContext | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.languageId !== SQL_LANGUAGE_ID) {
    return undefined;
  }

  return {
    editor,
    document: editor.document,
    resource: editor.document.uri
  };
}

export function getActiveSqlDocumentUri(): vscode.Uri | undefined {
  return getActiveSqlEditorContext()?.resource;
}

export function requireActiveSqlEditorContext(actionName: string): ActiveSqlEditorContext | undefined {
  const activeContext = getActiveSqlEditorContext();

  if (!activeContext) {
    void vscode.window.showWarningMessage(
      `${actionName} requires an active .sql editor.`
    );
    return undefined;
  }

  return activeContext;
}
