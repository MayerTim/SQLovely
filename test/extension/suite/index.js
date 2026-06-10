const { runFormattingSmokeTest } = require('./formattingSmoke.test');

async function run() {
  await runFormattingSmokeTest();
}

module.exports = { run };
