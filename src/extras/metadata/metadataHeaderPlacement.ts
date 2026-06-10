import type { DetectedSqlObject } from '../objectDetection';
import { maskSqlCommentsAndStrings } from '../sqlTextMasking';
import type { MetadataHeaderInsertionTarget } from './metadataHeaderModel';
import { findLineEndIncludingBreak, findLineStart, readLineIndentation } from './metadataText';

export function getMetadataHeaderInsertionTarget(
  text: string,
  object: DetectedSqlObject,
  nextObjectIndex: number
): MetadataHeaderInsertionTarget {
  const maskedText = maskSqlCommentsAndStrings(text);
  const beginMatch = findBeginTokenAfterObject(maskedText, object.index, nextObjectIndex);

  if (beginMatch) {
    const beginLineStart = findLineStart(text, beginMatch.index);

    return {
      index: beginLineStart,
      indentation: readLineIndentation(text, beginLineStart),
      blankLineAfter: false
    };
  }

  const declarationLineStart = findLineStart(text, object.index);

  return {
    index: findLineEndIncludingBreak(text, object.index),
    indentation: `${readLineIndentation(text, declarationLineStart)}  `,
    blankLineAfter: true
  };
}

function findBeginTokenAfterObject(
  maskedText: string,
  objectIndex: number,
  nextObjectIndex: number
): RegExpExecArray | undefined {
  const pattern = /\bbegin\b/giu;
  pattern.lastIndex = objectIndex;
  const match = pattern.exec(maskedText);

  if (!match || match.index >= nextObjectIndex) {
    return undefined;
  }

  return match;
}
