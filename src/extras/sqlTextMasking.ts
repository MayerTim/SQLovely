export function maskSqlCommentsAndStrings(text: string): string {
  const chars = Array.from(text);
  let index = 0;

  while (index < chars.length) {
    const current = chars[index];
    const next = chars[index + 1];

    if (current === "'" ) {
      index = maskSingleQuotedString(chars, index);
      continue;
    }

    if (current === '-' && next === '-') {
      index = maskLineComment(chars, index);
      continue;
    }

    if (current === '/' && next === '/') {
      index = maskLineComment(chars, index);
      continue;
    }

    if (current === '/' && next === '*') {
      index = maskBlockComment(chars, index);
      continue;
    }

    index += 1;
  }

  return chars.join('');
}

function maskSingleQuotedString(chars: string[], startIndex: number): number {
  let index = startIndex;

  chars[index] = ' ';
  index += 1;

  while (index < chars.length) {
    const current = chars[index];
    const next = chars[index + 1];

    if (current === "'" && next === "'") {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 2;
      continue;
    }

    chars[index] = preserveLineBreak(current);

    if (current === "'") {
      index += 1;
      break;
    }

    index += 1;
  }

  return index;
}

function maskLineComment(chars: string[], startIndex: number): number {
  let index = startIndex;

  while (index < chars.length) {
    const current = chars[index];

    if (current === '\r' || current === '\n') {
      break;
    }

    chars[index] = ' ';
    index += 1;
  }

  return index;
}

function maskBlockComment(chars: string[], startIndex: number): number {
  let index = startIndex;

  chars[index] = ' ';
  chars[index + 1] = ' ';
  index += 2;

  while (index < chars.length) {
    const current = chars[index];
    const next = chars[index + 1];

    chars[index] = preserveLineBreak(current);

    if (current === '*' && next === '/') {
      chars[index + 1] = ' ';
      index += 2;
      break;
    }

    index += 1;
  }

  return index;
}

function preserveLineBreak(value: string): string {
  return value === '\r' || value === '\n' ? value : ' ';
}
