const { runDiagnosticsSmokeTest } = require('./diagnosticsSmoke.test');
const { runFormattingSmokeTest } = require('./formattingSmoke.test');

async function run() {
  await runFormattingSmokeTest();
  await runDiagnosticsSmokeTest();
}

module.exports = { run };
