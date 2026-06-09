import * as vscode from 'vscode';

import { getActiveDialect, getExtrasConfiguration, getDiagnosticsConfiguration } from '../config';
import { SQL_LANGUAGE_ID } from '../constants';
import {
  findMissingMetadataHeaderIssues,
  MISSING_METADATA_HEADER_DIAGNOSTIC_CODE,
  SQL_OVELY_DIAGNOSTIC_SOURCE
} from './metadataHeaderDiagnostics';
import { findMaxLineLengthIssues, MAX_LINE_LENGTH_DIAGNOSTIC_CODE } from './lineLengthDiagnostics';

const DIAGNOSTIC_COLLECTION_NAME = 'sqlovely';

export function registerSqlovelyDiagnostics(context: vscode.ExtensionContext): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  const disposables: vscode.Disposable[] = [collection];

  const updateDocument = (document: vscode.TextDocument): void => {
    updateSqlovelyDiagnosticsForDocument(document, collection);
  };

  const updateAllOpenDocuments = (): void => {
    for (const document of vscode.workspace.textDocuments) {
      updateDocument(document);
    }
  };

  disposables.push(
    vscode.workspace.onDidOpenTextDocument(updateDocument),
    vscode.workspace.onDidChangeTextDocument((event) => updateDocument(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('sqlovely.dialect') ||
        event.affectsConfiguration('sqlovely.extras') ||
        event.affectsConfiguration('sqlovely.diagnostics')
      ) {
        updateAllOpenDocuments();
      }
    })
  );

  updateAllOpenDocuments();

  const aggregateDisposable = new vscode.Disposable(() => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
  });

  context.subscriptions.push(aggregateDisposable);
  return aggregateDisposable;
}

export function updateSqlovelyDiagnosticsForDocument(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  if (document.languageId !== SQL_LANGUAGE_ID) {
    collection.delete(document.uri);
    return;
  }

  const diagnosticsConfiguration = getDiagnosticsConfiguration(document.uri);
  const extrasConfiguration = getExtrasConfiguration(document.uri);

  if (!diagnosticsConfiguration.enabled) {
    collection.set(document.uri, []);
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];

  const shouldCheckMissingMetadataHeader = diagnosticsConfiguration.missingMetadataHeader.enabled &&
    extrasConfiguration.enabled &&
    extrasConfiguration.metadataHeader.enabled;

  if (shouldCheckMissingMetadataHeader) {
    const dialect = getActiveDialect(document.uri);
    for (const issue of findMissingMetadataHeaderIssues(document.getText(), dialect)) {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(document.positionAt(issue.startIndex), document.positionAt(issue.endIndex)),
        issue.message,
        vscode.DiagnosticSeverity.Warning
      );

      diagnostic.source = SQL_OVELY_DIAGNOSTIC_SOURCE;
      diagnostic.code = MISSING_METADATA_HEADER_DIAGNOSTIC_CODE;
      diagnostics.push(diagnostic);
    }
  }

  if (diagnosticsConfiguration.maxLineLength.enabled) {
    for (const issue of findMaxLineLengthIssues(document.getText(), diagnosticsConfiguration.maxLineLength.limit)) {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(document.positionAt(issue.startIndex), document.positionAt(issue.endIndex)),
        issue.message,
        vscode.DiagnosticSeverity.Information
      );

      diagnostic.source = SQL_OVELY_DIAGNOSTIC_SOURCE;
      diagnostic.code = MAX_LINE_LENGTH_DIAGNOSTIC_CODE;
      diagnostics.push(diagnostic);
    }
  }

  collection.set(document.uri, diagnostics);
}
