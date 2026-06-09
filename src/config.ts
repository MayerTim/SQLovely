import * as vscode from 'vscode';

import { CONFIG_NAMESPACE } from './constants';
import { DEFAULT_DIALECT_ID, getDialect, isSqlDialectId, type SqlDialect, type SqlDialectId } from './dialects';
import {
  DEFAULT_FORMAT_SQL_OPTIONS,
  normalizeIndentSize,
  normalizeInsertSpaces,
  normalizeKeywordCase,
  normalizeMaxConsecutiveBlankLines,
  type KeywordCase
} from './formatter/options';

export function getSqlovelyConfiguration(resource?: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_NAMESPACE, resource);
}

export function getConfiguredDialectId(resource?: vscode.Uri): SqlDialectId {
  const configuredValue = getSqlovelyConfiguration(resource).get<string>('dialect', DEFAULT_DIALECT_ID);

  if (isSqlDialectId(configuredValue)) {
    return configuredValue;
  }

  return DEFAULT_DIALECT_ID;
}

export function getActiveDialect(resource?: vscode.Uri): SqlDialect {
  return getDialect(getConfiguredDialectId(resource));
}

export interface SqlovelyFormatConfiguration {
  readonly enabled: boolean;
  readonly keywordCase: KeywordCase;
  readonly indentSize: number;
  readonly insertSpaces: boolean;
  readonly maxConsecutiveBlankLines: number;
  readonly ensureFinalNewline: boolean;
}

export interface SqlovelyExtrasConfiguration {
  readonly enabled: boolean;
  readonly applyOnSave: boolean;
  readonly applyWithFormatting: boolean;
  readonly metadataHeader: {
    readonly enabled: boolean;
  };
}

export interface SqlovelyDiagnosticsConfiguration {
  readonly enabled: boolean;
  readonly missingMetadataHeader: {
    readonly enabled: boolean;
  };
  readonly maxLineLength: {
    readonly enabled: boolean;
    readonly limit: number;
  };
}

export function getFormatConfiguration(resource?: vscode.Uri): SqlovelyFormatConfiguration {
  const configuration = getSqlovelyConfiguration(resource);

  return {
    enabled: configuration.get<boolean>('format.enabled', true),
    keywordCase: normalizeKeywordCase(configuration.get<string>('format.keywordCase', DEFAULT_FORMAT_SQL_OPTIONS.keywordCase)),
    indentSize: normalizeIndentSize(configuration.get<number>('format.indentSize', DEFAULT_FORMAT_SQL_OPTIONS.indentSize)),
    insertSpaces: normalizeInsertSpaces(configuration.get<boolean>('format.insertSpaces', DEFAULT_FORMAT_SQL_OPTIONS.insertSpaces)),
    maxConsecutiveBlankLines: normalizeMaxConsecutiveBlankLines(
      configuration.get<number>('format.maxConsecutiveBlankLines', DEFAULT_FORMAT_SQL_OPTIONS.maxConsecutiveBlankLines)
    ),
    ensureFinalNewline: configuration.get<boolean>(
      'format.ensureFinalNewline',
      DEFAULT_FORMAT_SQL_OPTIONS.ensureFinalNewline
    )
  };
}

export function getExtrasConfiguration(resource?: vscode.Uri): SqlovelyExtrasConfiguration {
  const configuration = getSqlovelyConfiguration(resource);

  return {
    enabled: configuration.get<boolean>('extras.enabled', true),
    applyOnSave: configuration.get<boolean>('extras.applyOnSave', false),
    applyWithFormatting: configuration.get<boolean>('extras.applyWithFormatting', true),
    metadataHeader: {
      enabled: configuration.get<boolean>('extras.metadataHeader.enabled', true)
    }
  };
}

export function getDiagnosticsConfiguration(resource?: vscode.Uri): SqlovelyDiagnosticsConfiguration {
  const configuration = getSqlovelyConfiguration(resource);

  return {
    enabled: configuration.get<boolean>('diagnostics.enabled', true),
    missingMetadataHeader: {
      enabled: configuration.get<boolean>('diagnostics.missingMetadataHeader.enabled', true)
    },
    maxLineLength: {
      enabled: configuration.get<boolean>('diagnostics.maxLineLength.enabled', true),
      limit: normalizeMaxLineLength(configuration.get<number>('diagnostics.maxLineLength.limit', 120))
    }
  };
}

export async function updateConfiguredDialectId(
  dialectId: SqlDialectId,
  resource?: vscode.Uri
): Promise<void> {
  const target = getPreferredConfigurationTarget(resource);
  await getSqlovelyConfiguration(resource).update('dialect', dialectId, target);
}

function getPreferredConfigurationTarget(resource?: vscode.Uri): vscode.ConfigurationTarget {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return vscode.ConfigurationTarget.Global;
  }

  if (resource && vscode.workspace.getWorkspaceFolder(resource)) {
    return vscode.ConfigurationTarget.WorkspaceFolder;
  }

  return vscode.ConfigurationTarget.Workspace;
}

function normalizeMaxLineLength(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(40, Math.min(300, Math.floor(value)));
  }

  return 120;
}
