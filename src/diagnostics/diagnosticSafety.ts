import {
  analyzeFormattingSafety,
  type FormattingSafetyDecision,
  type FormattingSafetyLimits,
} from '../formatter/performanceGuards';

export interface DiagnosticSafetyDecision {
  readonly formattingSafety: FormattingSafetyDecision;
  readonly skipExpensiveMetadataDiagnostics: boolean;
}

export function analyzeDiagnosticSafety(
  text: string,
  safetyLimits: FormattingSafetyLimits,
): DiagnosticSafetyDecision {
  const formattingSafety = analyzeFormattingSafety(text, splitLinesForWorkload(text), safetyLimits);

  return {
    formattingSafety,
    skipExpensiveMetadataDiagnostics: formattingSafety.skipExpensiveFormatting,
  };
}

function splitLinesForWorkload(text: string): readonly string[] {
  if (text.length === 0) {
    return [''];
  }

  return text.split(/\r?\n/);
}
