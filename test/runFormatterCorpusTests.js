const { assert, runTest } = require('./helpers/runTest');
const {
  assertCorpusFormatting,
  corpusRoot,
  findCorpusFixturePairingIssues,
  listFixturePairs,
  readFixture,
  toCrLf,
} = require('./helpers/formatterCorpus');

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
