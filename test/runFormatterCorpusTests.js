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

const inputFixtures = listInputFixtures(corpusRoot);

if (inputFixtures.length === 0) {
  throw new Error(`No formatter corpus fixtures found under ${corpusRoot}.`);
}

runTest('formatter corpus fixtures are paired', () => {
  assert.deepEqual(findCorpusFixturePairingIssues(corpusRoot), []);
});

for (const inputPath of inputFixtures) {
  const expectedPath = getExpectedFixturePath(inputPath);
  const fixtureName = getFixtureName(inputPath);

  runTest(`formatter corpus: ${fixtureName}`, () => {
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
