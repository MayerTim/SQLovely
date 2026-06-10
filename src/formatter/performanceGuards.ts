export interface FormattingSafetyLimits {
  readonly enabled: boolean;
  readonly maxComplexDocumentLength: number;
  readonly maxComplexDocumentLines: number;
  readonly maxComplexLineLength: number;
}

export interface FormattingWorkload {
  readonly documentLength: number;
  readonly lineCount: number;
  readonly longestLineLength: number;
}

export interface FormattingSafetyDecision {
  readonly workload: FormattingWorkload;
  readonly limits: FormattingSafetyLimits;
  readonly skipExpensiveFormatting: boolean;
  readonly reasons: readonly string[];
}

export const DEFAULT_FORMATTING_SAFETY_LIMITS: FormattingSafetyLimits = {
  enabled: true,
  maxComplexDocumentLength: 1_000_000,
  maxComplexDocumentLines: 5_000,
  maxComplexLineLength: 5_000,
};

export function resolveFormattingSafetyLimits(
  options: Partial<FormattingSafetyLimits> | undefined,
): FormattingSafetyLimits {
  const merged = { ...DEFAULT_FORMATTING_SAFETY_LIMITS, ...options };

  return {
    enabled: merged.enabled !== false,
    maxComplexDocumentLength: normalizePositiveInteger(
      merged.maxComplexDocumentLength,
      DEFAULT_FORMATTING_SAFETY_LIMITS.maxComplexDocumentLength,
      10_000,
      10_000_000,
    ),
    maxComplexDocumentLines: normalizePositiveInteger(
      merged.maxComplexDocumentLines,
      DEFAULT_FORMATTING_SAFETY_LIMITS.maxComplexDocumentLines,
      100,
      100_000,
    ),
    maxComplexLineLength: normalizePositiveInteger(
      merged.maxComplexLineLength,
      DEFAULT_FORMATTING_SAFETY_LIMITS.maxComplexLineLength,
      250,
      100_000,
    ),
  };
}

export function analyzeFormattingSafety(
  text: string,
  lines: readonly string[],
  limits: FormattingSafetyLimits,
): FormattingSafetyDecision {
  const workload = analyzeFormattingWorkload(text, lines);

  if (!limits.enabled) {
    return {
      workload,
      limits,
      skipExpensiveFormatting: false,
      reasons: [],
    };
  }

  const reasons: string[] = [];

  if (workload.documentLength > limits.maxComplexDocumentLength) {
    reasons.push(`document length ${workload.documentLength} > ${limits.maxComplexDocumentLength}`);
  }

  if (workload.lineCount > limits.maxComplexDocumentLines) {
    reasons.push(`line count ${workload.lineCount} > ${limits.maxComplexDocumentLines}`);
  }

  return {
    workload,
    limits,
    skipExpensiveFormatting: reasons.length > 0,
    reasons,
  };
}

export function shouldRunExpensiveLineFormatting(
  line: string,
  decision: FormattingSafetyDecision,
): boolean {
  if (!decision.limits.enabled) {
    return true;
  }

  if (decision.skipExpensiveFormatting) {
    return false;
  }

  return line.length <= decision.limits.maxComplexLineLength;
}

export function createFormattingSafetySummary(
  decision: FormattingSafetyDecision,
): string | undefined {
  if (!decision.skipExpensiveFormatting) {
    return undefined;
  }

  return `skipped expensive formatter passes (${decision.reasons.join(', ')})`;
}

function analyzeFormattingWorkload(text: string, lines: readonly string[]): FormattingWorkload {
  let longestLineLength = 0;

  for (const line of lines) {
    longestLineLength = Math.max(longestLineLength, line.length);
  }

  return {
    documentLength: text.length,
    lineCount: lines.length,
    longestLineLength,
  };
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
}
