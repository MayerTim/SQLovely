import * as vscode from 'vscode';

export async function replaceDocumentText(
  editor: vscode.TextEditor,
  originalText: string,
  nextText: string
): Promise<boolean> {
  const fullRange = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(originalText.length)
  );

  return editor.edit((editBuilder) => {
    editBuilder.replace(fullRange, nextText);
  });
}
