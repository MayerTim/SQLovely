const fs = require('fs');
const path = require('path');

const { assert, runTest } = require('./helpers/runTest');
const { formatSql, watcomDialect, mssqlDialect, defaultOptions } = require('./formatter/helpers');

const corpusRoot = path.join(__dirname, 'corpus');
const dialectsByCorpusDirectory = new Map([
  ['watcom', watcomDialect],
  ['mssql', mssqlDialect],
]);

function listFiles(directory, predicate) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath, predicate);
      }

      return entry.isFile() && predicate(entry.name) ? [entryPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function listInputFixtures(directory) {
  return listFiles(directory, (fileName) => fileName.endsWith('.input.sql'));
}

function listSqlFixtureFiles(directory) {
  return listFiles(directory, (fileName) => fileName.endsWith('.sql'));
}

function getExpectedFixturePath(inputPath) {
  return inputPath.replace(/\.input\.sql$/u, '.expected.sql');
}

function getInputFixturePath(expectedPath) {
  return expectedPath.replace(/\.expected\.sql$/u, '.input.sql');
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

function getRelativeFixturePath(fixturePath) {
  return path.relative(process.cwd(), fixturePath);
}

function toCrLf(text) {
  return text.replace(/\r\n|\r|\n/gu, '\n').replace(/\n/gu, '\r\n');
}

function readFixture(fixturePath) {
  return fs.readFileSync(fixturePath, 'utf8');
}

function findCorpusFixturePairingIssues(directory) {
  return listSqlFixtureFiles(directory).flatMap((fixturePath) => {
    const relativeFixturePath = getRelativeFixturePath(fixturePath);

    if (fixturePath.endsWith('.input.sql')) {
      const expectedPath = getExpectedFixturePath(fixturePath);

      return fs.existsSync(expectedPath)
        ? []
        : [`Missing expected corpus fixture for ${relativeFixturePath}.`];
    }

    if (fixturePath.endsWith('.expected.sql')) {
      const inputPath = getInputFixturePath(fixturePath);

      return fs.existsSync(inputPath)
        ? []
        : [`Missing input corpus fixture for ${relativeFixturePath}.`];
    }

    return [
      `Unsupported corpus SQL fixture name ${relativeFixturePath}; use .input.sql or .expected.sql.`,
    ];
  });
}

function listFixturePairs() {
  return listInputFixtures(corpusRoot).map((inputPath) => ({
    dialect: getDialectForFixture(inputPath),
    expectedPath: getExpectedFixturePath(inputPath),
    inputPath,
    name: getFixtureName(inputPath),
  }));
}

function assertCorpusFormatting({ dialect, expected, fixtureName, input, variant }) {
  const result = formatSql(input, dialect, defaultOptions);
  const idempotentResult = formatSql(expected, dialect, defaultOptions);
  const testName = variant ? `${fixtureName} (${variant})` : fixtureName;

  assert.equal(result.text, expected, `${testName} did not format to the expected output.`);
  assert.equal(idempotentResult.text, expected, `${testName} expected output is not idempotent.`);
}

const fixturePairs = listFixturePairs();

if (fixturePairs.length === 0) {
  throw new Error(`No formatter corpus fixtures found under ${corpusRoot}.`);
}

runTest('formatter corpus fixtures are paired', () => {
  assert.deepEqual(findCorpusFixturePairingIssues(corpusRoot), []);
});

for (const fixture of fixturePairs) {
  runTest(`formatter corpus: ${fixture.name}`, () => {
    assertCorpusFormatting({
      dialect: fixture.dialect,
      expected: readFixture(fixture.expectedPath),
      fixtureName: fixture.name,
      input: readFixture(fixture.inputPath),
    });
  });
}

for (const fixture of fixturePairs) {
  runTest(`formatter corpus CRLF: ${fixture.name}`, () => {
    assertCorpusFormatting({
      dialect: fixture.dialect,
      expected: toCrLf(readFixture(fixture.expectedPath)),
      fixtureName: fixture.name,
      input: toCrLf(readFixture(fixture.inputPath)),
      variant: 'CRLF',
    });
  });
}
