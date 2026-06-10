import * as vscode from 'vscode';

import { COMMANDS } from '../constants';
import { getActiveDialect, getFormatConfiguration } from '../config';
import { formatSqlDocument } from '../formatter';
import { logFormattingSafetySummary } from '../logging';

interface DirectoryFormatStats {
  readonly total: number;
  formatted: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

const SQL_FILE_PATTERN = '**/*.sql';
const SQL_FILE_EXCLUDE_PATTERN =
  '{**/.git/**,**/.svn/**,**/.hg/**,**/node_modules/**,**/out/**,**/dist/**}';

export function registerFormatSqlFilesInDirectoryCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMANDS.formatSqlFilesInDirectory, async () => {
    const selectedDirectory = await askForDirectory();

    if (!selectedDirectory) {
      return;
    }

    const sqlFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(selectedDirectory, SQL_FILE_PATTERN),
      SQL_FILE_EXCLUDE_PATTERN,
    );

    if (sqlFiles.length === 0) {
      await vscode.window.showInformationMessage(
        'SQLovely: No .sql files found in the selected directory.',
      );
      return;
    }

    const shouldFormat = await confirmDirectoryFormatting(selectedDirectory, sqlFiles.length);

    if (!shouldFormat) {
      return;
    }

    const stats = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'SQLovely: Formatting SQL files',
        cancellable: true,
      },
      async (progress, token) => formatSqlFiles(sqlFiles, progress, token),
    );

    await vscode.window.showInformationMessage(
      `SQLovely: Formatted ${stats.formatted} SQL file(s). ` +
        `${stats.unchanged} unchanged, ${stats.skipped} skipped, ${stats.failed} failed.`,
    );
  });
}

async function askForDirectory(): Promise<vscode.Uri | undefined> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: workspaceFolder,
    openLabel: 'Format SQL files',
    title: 'Select a directory containing SQL files',
  });

  return selected?.[0];
}

async function confirmDirectoryFormatting(
  directory: vscode.Uri,
  fileCount: number,
): Promise<boolean> {
  const directoryLabel = vscode.workspace.asRelativePath(directory, false);
  const action = 'Format SQL files';
  const selection = await vscode.window.showWarningMessage(
    `Format ${fileCount} .sql file(s) in "${directoryLabel}"? SQLovely Extras will not be applied by this command.`,
    { modal: true },
    action,
  );

  return selection === action;
}

async function formatSqlFiles(
  sqlFiles: readonly vscode.Uri[],
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
): Promise<DirectoryFormatStats> {
  const stats: DirectoryFormatStats = {
    total: sqlFiles.length,
    formatted: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  const increment = sqlFiles.length > 0 ? 100 / sqlFiles.length : 100;

  for (const uri of sqlFiles) {
    if (token.isCancellationRequested) {
      stats.skipped +=
        sqlFiles.length - stats.formatted - stats.unchanged - stats.skipped - stats.failed;
      break;
    }

    progress.report({
      message: vscode.workspace.asRelativePath(uri, false),
      increment,
    });

    try {
      const result = await formatSingleSqlFile(uri, token);

      if (result === 'formatted') {
        stats.formatted += 1;
      } else if (result === 'unchanged') {
        stats.unchanged += 1;
      } else {
        stats.skipped += 1;
      }
    } catch {
      stats.failed += 1;
    }
  }

  return stats;
}

type SingleFileFormatResult = 'formatted' | 'unchanged' | 'skipped';

async function formatSingleSqlFile(
  uri: vscode.Uri,
  token: vscode.CancellationToken,
): Promise<SingleFileFormatResult> {
  const openDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  );

  if (openDocument?.isDirty) {
    return 'skipped';
  }

  const formatConfiguration = getFormatConfiguration(uri);

  if (!formatConfiguration.enabled) {
    return 'skipped';
  }

  const document = openDocument ?? (await vscode.workspace.openTextDocument(uri));
  const originalText = document.getText();
  const result = formatSqlDocument(originalText, getActiveDialect(uri), {
    keywordCase: formatConfiguration.keywordCase,
    indentSize: formatConfiguration.indentSize,
    insertSpaces: formatConfiguration.insertSpaces,
    maxConsecutiveBlankLines: formatConfiguration.maxConsecutiveBlankLines,
    ensureFinalNewline: formatConfiguration.ensureFinalNewline,
    safetyLimits: formatConfiguration.safetyLimits,
    applyExtrasWithFormatting: false,
    metadataHeaderEnabled: false,
    isCancellationRequested: () => token.isCancellationRequested,
  });

  logFormattingSafetySummary(
    result.formatting.safetySummary,
    vscode.workspace.asRelativePath(uri, false),
  );

  if (token.isCancellationRequested) {
    return 'skipped';
  }

  if (!result.changed) {
    return 'unchanged';
  }

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(originalText.length),
  );

  edit.replace(uri, fullRange, result.text);

  const applied = await vscode.workspace.applyEdit(edit);

  if (!applied) {
    throw new Error(`Could not apply formatting edit for ${uri.toString()}.`);
  }

  const saved = await document.save();

  if (!saved) {
    throw new Error(`Could not save formatted SQL file ${uri.toString()}.`);
  }

  return 'formatted';
}
