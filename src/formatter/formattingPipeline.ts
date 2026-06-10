import type { SqlDialect } from '../dialects';
import { expandWatcomInlineIfLine } from './inlineIfFormatting';
import { expandUnionAllLine } from './unionAllFormatting';
import { createInitialCursorForFormattingState, expandWatcomCursorForLine } from './cursorForFormatting';
import { createInitialQueryClauseFormattingState, expandWatcomQueryClauseLine } from './queryClauseFormatting';
import { createInitialExceptionFormattingState, expandWatcomExceptionLine } from './exceptionFormatting';
import { createInitialIfExpressionFormattingState, expandWatcomIfExpressionLine } from './ifExpressionFormatting';
import { createInitialCaseExpressionFormattingState, expandWatcomCaseExpressionLine } from './caseExpressionFormatting';
import { createInitialBlockEndFormattingState, expandWatcomBlockEndLine } from './blockEndFormatting';
import { createInitialParenthesisFormattingState, expandParenthesesInLine } from './parenthesisFormatting';
import { createInitialSqlLineScanState } from './sqlLineScanner';
import { shouldRunExpensiveLineFormatting, type FormattingSafetyDecision } from './performanceGuards';

interface FormattingPipelineContext {
  readonly dialect: SqlDialect;
  readonly safety: FormattingSafetyDecision;
}

interface FormattingPipelineLine {
  readonly line: string;
  readonly canRunExpensiveFormatting: boolean;
}

interface FormattingPipelinePass {
  readonly name: string;
  readonly run: (entry: FormattingPipelineLine) => readonly FormattingPipelineLine[];
}

export interface FormattingPipeline {
  readonly expandLine: (sourceLine: string) => readonly string[];
}

export function createFormattingPipeline(context: FormattingPipelineContext): FormattingPipeline {
  const passes = createFormattingPipelinePasses(context);

  return {
    expandLine(sourceLine: string): readonly string[] {
      const initialEntries: readonly FormattingPipelineLine[] = [{
        line: sourceLine,
        canRunExpensiveFormatting: true
      }];

      return passes
        .reduce(runFormattingPipelinePass, initialEntries)
        .map((entry) => entry.line);
    }
  };
}

function createFormattingPipelinePasses(context: FormattingPipelineContext): readonly FormattingPipelinePass[] {
  let inlineIfScanState = createInitialSqlLineScanState();
  let unionAllScanState = createInitialSqlLineScanState();
  let cursorForScanState = createInitialCursorForFormattingState();
  let queryClauseFormattingState = createInitialQueryClauseFormattingState();
  let exceptionFormattingState = createInitialExceptionFormattingState();
  let ifExpressionFormattingState = createInitialIfExpressionFormattingState();
  let caseExpressionFormattingState = createInitialCaseExpressionFormattingState();
  let blockEndFormattingState = createInitialBlockEndFormattingState();
  let parenthesisExpansionState = createInitialParenthesisFormattingState();

  return [
    {
      name: 'inlineIf',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandWatcomInlineIfLine(entry.line, context.dialect, inlineIfScanState)
          : { lines: [entry.line], nextState: inlineIfScanState };
        inlineIfScanState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'unionAll',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandUnionAllLine(entry.line, unionAllScanState)
          : { lines: [entry.line], nextState: unionAllScanState };
        unionAllScanState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'cursorFor',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandWatcomCursorForLine(entry.line, context.dialect, cursorForScanState)
          : { lines: [entry.line], nextState: cursorForScanState };
        cursorForScanState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'queryClauses',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandWatcomQueryClauseLine(entry.line, context.dialect, queryClauseFormattingState)
          : { lines: [entry.line], nextState: queryClauseFormattingState };
        queryClauseFormattingState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'exceptions',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandWatcomExceptionLine(entry.line, context.dialect, exceptionFormattingState)
          : { lines: [entry.line], nextState: exceptionFormattingState };
        exceptionFormattingState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'ifExpressions',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandWatcomIfExpressionLine(entry.line, context.dialect, ifExpressionFormattingState)
          : { lines: [entry.line], nextState: ifExpressionFormattingState };
        ifExpressionFormattingState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'caseExpressions',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandWatcomCaseExpressionLine(entry.line, context.dialect, caseExpressionFormattingState)
          : { lines: [entry.line], nextState: caseExpressionFormattingState };
        caseExpressionFormattingState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'blockEndings',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandWatcomBlockEndLine(entry.line, context.dialect, blockEndFormattingState)
          : { lines: [entry.line], nextState: blockEndFormattingState };
        blockEndFormattingState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    },
    {
      name: 'parentheses',
      run(entry: FormattingPipelineLine): readonly FormattingPipelineLine[] {
        const canRunPass = context.dialect.id === 'watcom' && canRunExpensivePass(entry, context.safety);
        const result = canRunPass
          ? expandParenthesesInLine(entry.line, parenthesisExpansionState)
          : { lines: [entry.line], nextState: parenthesisExpansionState };
        parenthesisExpansionState = result.nextState;
        return toPipelineLines(result.lines, canRunPass);
      }
    }
  ];
}

function runFormattingPipelinePass(
  entries: readonly FormattingPipelineLine[],
  pass: FormattingPipelinePass
): readonly FormattingPipelineLine[] {
  return entries.flatMap((entry) => pass.run(entry));
}

function canRunExpensivePass(entry: FormattingPipelineLine, safety: FormattingSafetyDecision): boolean {
  return entry.canRunExpensiveFormatting && shouldRunExpensiveLineFormatting(entry.line, safety);
}

function toPipelineLines(lines: readonly string[], canRunExpensiveFormatting: boolean): readonly FormattingPipelineLine[] {
  return lines.map((line) => ({ line, canRunExpensiveFormatting }));
}
