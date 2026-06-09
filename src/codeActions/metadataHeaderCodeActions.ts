import * as vscode from 'vscode';

import { getActiveDialect, getExtrasConfiguration, getDiagnosticsConfiguration } from '../config';
import { SQL_LANGUAGE_ID } from '../constants';
import { insertOrUpdateMetadataHeader } from '../extras';
import {
  findMissingMetadataHeaderIssue,
  MISSING_METADATA_HEADER_DIAGNOSTIC_CODE,
  SQL_OVELY_DIAGNOSTIC_SOURCE
} from '../diagnostics';
import { getDefaultAuthorName } from '../utils/defaultAuthor';

const PROVIDED_CODE_ACTION_KINDS = [
  vscode.CodeActionKind.QuickFix,
  vscode.CodeActionKind.SourceFixAll
];

export function registerSqlovelyCodeActionProviders(): vscode.Disposable {
  return vscode.languages.registerCodeActionsProvider(
    SQL_LANGUAGE_ID,
    new SqlovelyMetadataHeaderCodeActionProvider(),
    { providedCodeActionKinds: PROVIDED_CODE_ACTION_KINDS }
  );
}

class SqlovelyMetadataHeaderCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    if (!isMissingMetadataHeaderActionAllowed(document.uri)) {
      return [];
    }

    const wantsSourceFixAll = context.only?.contains(vscode.CodeActionKind.SourceFixAll) ?? false;
    const relevantDiagnostics = context.diagnostics.filter(isMissingMetadataHeaderDiagnostic);

    if (relevantDiagnostics.length === 0 && !wantsSourceFixAll) {
      return [];
    }

    const dialect = getActiveDialect(document.uri);
    const diagnosticsConfiguration = getDiagnosticsConfiguration(document.uri);
    const issue = findMissingMetadataHeaderIssue(document.getText(), dialect);

    if (!issue) {
      return [];
    }

    const action = new vscode.CodeAction(
      `Insert SQLovely metadata header for ${issue.object.type} ${issue.object.name}`,
      wantsSourceFixAll ? vscode.CodeActionKind.SourceFixAll : vscode.CodeActionKind.QuickFix
    );

    const result = insertOrUpdateMetadataHeader(document.getText(), dialect, {
      author: getDefaultAuthorName(),
      maxLineLength: diagnosticsConfiguration.maxLineLength.limit
    });

    if (result.text === document.getText()) {
      return [];
    }

    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
      result.text
    );
    action.diagnostics = relevantDiagnostics;
    action.isPreferred = true;

    return [action];
  }
}

function isMissingMetadataHeaderActionAllowed(resource: vscode.Uri): boolean {
  const diagnosticsConfiguration = getDiagnosticsConfiguration(resource);
  const extrasConfiguration = getExtrasConfiguration(resource);

  return Boolean(
    diagnosticsConfiguration.enabled &&
    diagnosticsConfiguration.missingMetadataHeader.enabled &&
    extrasConfiguration.enabled &&
    extrasConfiguration.metadataHeader.enabled
  );
}

function isMissingMetadataHeaderDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return diagnostic.source === SQL_OVELY_DIAGNOSTIC_SOURCE &&
    diagnostic.code === MISSING_METADATA_HEADER_DIAGNOSTIC_CODE;
}
