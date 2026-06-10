const fs = require('fs');
const path = require('path');

const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite');
  const workspacePath = path.resolve(
    extensionDevelopmentPath,
    '.vscode-test/extension-smoke-workspace',
  );

  fs.rmSync(workspacePath, { force: true, recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspacePath, '--disable-workspace-trust'],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
