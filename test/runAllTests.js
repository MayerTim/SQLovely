const { getTotalPassed } = require('./helpers/runTest');

const suites = [
  './runProjectValidationTests',
  './runMetadataHeaderTests',
  './runMetadataRegressionTests',
  './runFormatterTests',
  './runFormatterCorpusHelperTests',
  './runFormatterCorpusTests',
  './runDiagnosticsTests',
];

for (const suite of suites) {
  require(suite);
}

console.log(`\nAll SQLovely tests passed (${getTotalPassed()} assertions).`);
