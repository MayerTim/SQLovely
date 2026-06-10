const fs = require('fs');
const os = require('os');
const path = require('path');

const { assert, runTest } = require('./helpers/runTest');
const { findCorpusFixturePairingIssues, toCrLf } = require('./helpers/formatterCorpus');

function withTemporaryCorpus(testFn) {
  const corpusDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlovely-corpus-'));

  try {
    testFn(corpusDirectory);
  } finally {
    fs.rmSync(corpusDirectory, { recursive: true, force: true });
  }
}

function writeFixture(root, relativePath, contents = 'select 1;\n') {
  const fixturePath = path.join(root, relativePath);

  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, contents, 'utf8');
}

runTest('formatter corpus helpers: accept paired fixtures', () => {
  withTemporaryCorpus((corpusDirectory) => {
    writeFixture(corpusDirectory, 'watcom/example.input.sql');
    writeFixture(corpusDirectory, 'watcom/example.expected.sql');

    assert.deepEqual(findCorpusFixturePairingIssues(corpusDirectory), []);
  });
});

runTest('formatter corpus helpers: detect missing expected fixtures', () => {
  withTemporaryCorpus((corpusDirectory) => {
    writeFixture(corpusDirectory, 'watcom/missing-expected.input.sql');

    assert.deepEqual(findCorpusFixturePairingIssues(corpusDirectory), [
      `Missing expected corpus fixture for ${path.relative(
        process.cwd(),
        path.join(corpusDirectory, 'watcom/missing-expected.input.sql'),
      )}.`,
    ]);
  });
});

runTest('formatter corpus helpers: detect missing input fixtures', () => {
  withTemporaryCorpus((corpusDirectory) => {
    writeFixture(corpusDirectory, 'watcom/missing-input.expected.sql');

    assert.deepEqual(findCorpusFixturePairingIssues(corpusDirectory), [
      `Missing input corpus fixture for ${path.relative(
        process.cwd(),
        path.join(corpusDirectory, 'watcom/missing-input.expected.sql'),
      )}.`,
    ]);
  });
});

runTest('formatter corpus helpers: reject unsupported SQL fixture names', () => {
  withTemporaryCorpus((corpusDirectory) => {
    writeFixture(corpusDirectory, 'watcom/unsupported.sql');

    assert.deepEqual(findCorpusFixturePairingIssues(corpusDirectory), [
      `Unsupported corpus SQL fixture name ${path.relative(
        process.cwd(),
        path.join(corpusDirectory, 'watcom/unsupported.sql'),
      )}; use .input.sql or .expected.sql.`,
    ]);
  });
});

runTest('formatter corpus helpers: normalize mixed line endings to CRLF', () => {
  assert.equal(toCrLf('first\nsecond\rthird\r\nfourth'), 'first\r\nsecond\r\nthird\r\nfourth');
});
