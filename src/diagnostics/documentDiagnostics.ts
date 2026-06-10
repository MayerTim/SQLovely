import * as vscode from 'vscode';

import { getActiveDialect, getExtrasConfiguration, getDiagnosticsConfiguration, getFormatConfiguration } from '../config';
import { SQL_LANGUAGE_ID } from '../constants';
import {
  findMissingMetadataHeaderIssues,
  MISSING_METADATA_HEADER_DIAGNOSTIC_CODE,
  SQL_OVELY_DIAGNOSTIC_SOURCE
} from './metadataHeaderDiagnostics';
import { findMaxLineLengthIssues, MAX_LINE_LENGTH_DIAGNOSTIC_CODE } from './lineLengthDiagnostics';
import { analyzeDiagnosticSafety } from './diagnosticSafety';

const DIAGNOSTIC_COLLECTION_NAME = 'sqlovely';
const CHANGE_DIAGNOSTIC_DEBOUNCE_MS = 400;

export function registerSqlovelyDiagnostics(context: vscode.ExtensionContext): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  const disposables: vscode.Disposable[] = [collection];
  const pendingUpdates = new Map<string, NodeJS.Timeout>();

  const cancelPendingUpdate = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const pendingUpdate = pendingUpdates.get(key);

    if (pendingUpdate) {
      clearTimeout(pendingUpdate);
      pendingUpdates.delete(key);
    }
  };

  const updateDocumentImmediately = (document: vscode.TextDocument): void => {
    cancelPendingUpdate(document);
    updateSqlovelyDiagnosticsForDocument(document, collection);
  };

  const scheduleDocumentUpdate = (document: vscode.TextDocument): void => {
    if (document.languageId !== SQL_LANGUAGE_ID) {
      cancelPendingUpdate(document);
      collection.delete(document.uri);
      return;
    }

    cancelPendingUpdate(document);

    const key = document.uri.toString();
    const timeout = setTimeout(() => {
      pendingUpdates.delete(key);
      updateSqlovelyDiagnosticsForDocument(document, collection);
    }, CHANGE_DIAGNOSTIC_DEBOUNCE_MS);

    pendingUpdates.set(key, timeout);
  };

  const updateAllOpenDocuments = (): void => {
    for (const document of vscode.workspace.textDocuments) {
      updateDocumentImmediately(document);
    }
  };

  disposables.push(
    vscode.workspace.onDidOpenTextDocument(updateDocumentImmediately),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleDocumentUpdate(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      cancelPendingUpdate(document);
      collection.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('sqlovely.dialect') ||
        event.affectsConfiguration('sqlovely.extras') ||
        event.affectsConfiguration('sqlovely.diagnostics') ||
        event.affectsConfiguration('sqlovely.format.safety')
      ) {
        updateAllOpenDocuments();
      }
    })
  );

  updateAllOpenDocuments();

  const aggregateDisposable = new vscode.Disposable(() => {
    for (const pendingUpdate of pendingUpdates.values()) {
      clearTimeout(pendingUpdate);
    }
    pendingUpdates.clear();

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

  const text = document.getText();
  const formatConfiguration = getFormatConfiguration(document.uri);
  const diagnosticSafety = analyzeDiagnosticSafety(text, formatConfiguration.safetyLimits);
  const diagnostics: vscode.Diagnostic[] = [];

  const shouldCheckMissingMetadataHeader = diagnosticsConfiguration.missingMetadataHeader.enabled &&
    extrasConfiguration.enabled &&
    extrasConfiguration.metadataHeader.enabled &&
    !diagnosticSafety.skipExpensiveMetadataDiagnostics;

  if (shouldCheckMissingMetadataHeader) {
    const dialect = getActiveDialect(document.uri);
    for (const issue of findMissingMetadataHeaderIssues(text, dialect)) {
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
    for (const issue of findMaxLineLengthIssues(text, diagnosticsConfiguration.maxLineLength.limit)) {
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
