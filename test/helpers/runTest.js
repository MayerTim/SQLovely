const assert = require('assert/strict');

let totalPassed = 0;

function runTest(name, testFn) {
  try {
    testFn();
    totalPassed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function getTotalPassed() {
  return totalPassed;
}

module.exports = {
  assert,
  runTest,
  getTotalPassed
};
