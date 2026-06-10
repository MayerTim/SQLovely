const fs = require('fs');
const path = require('path');

const { assert, runTest } = require('./helpers/runTest');
const { formatSql, watcomDialect, mssqlDialect, defaultOptions } = require('./formatter/helpers');

const corpusRoot = path.join(__dirname, 'corpus');
const dialectsByCorpusDirectory = new Map([
  ['watcom', watcomDialect],
  ['mssql', mssqlDialect],
]);

function listInputFixtures(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listInputFixtures(entryPath);
      }

      return entry.isFile() && entry.name.endsWith('.input.sql') ? [entryPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function getExpectedFixturePath(inputPath) {
  return inputPath.replace(/\.input\.sql$/u, '.expected.sql');
}

function getDialectForFixture(inputPath) {
  const relativePath = path.relative(corpusRoot, inputPath);
  const corpusDirectory = relativePath.split(path.sep)[0];
  const dialect = dialectsByCorpusDirectory.get(corpusDirectory);

  if (!dialect) {
    throw new Error(`No corpus dialect is configured for '${corpusDirectory}'.`);
  }

  return dialect;
}

function getFixtureName(inputPath) {
  return path.relative(corpusRoot, inputPath).replace(/\.input\.sql$/u, '');
}

const inputFixtures = listInputFixtures(corpusRoot);

if (inputFixtures.length === 0) {
  throw new Error(`No formatter corpus fixtures found under ${corpusRoot}.`);
}

for (const inputPath of inputFixtures) {
  const expectedPath = getExpectedFixturePath(inputPath);
  const fixtureName = getFixtureName(inputPath);

  runTest(`formatter corpus: ${fixtureName}`, () => {
    assert.ok(
      fs.existsSync(expectedPath),
      `Expected corpus fixture is missing for ${path.relative(process.cwd(), inputPath)}.`,
    );

    const input = fs.readFileSync(inputPath, 'utf8');
    const expected = fs.readFileSync(expectedPath, 'utf8');
    const dialect = getDialectForFixture(inputPath);
    const result = formatSql(input, dialect, defaultOptions);
    const idempotentResult = formatSql(expected, dialect, defaultOptions);

    assert.equal(result.text, expected, `${fixtureName} did not format to the expected output.`);
    assert.equal(
      idempotentResult.text,
      expected,
      `${fixtureName} expected output is not idempotent.`,
    );
  });
}
