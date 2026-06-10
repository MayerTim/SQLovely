const { getTotalPassed } = require('./helpers/runTest');

const suites = [
  './runProjectValidationTests',
  './runMetadataHeaderTests',
  './runMetadataRegressionTests',
  './runFormatterTests',
  './runDiagnosticsTests',
];

for (const suite of suites) {
  require(suite);
}

console.log(`\nAll SQLovely tests passed (${getTotalPassed()} assertions).`);
