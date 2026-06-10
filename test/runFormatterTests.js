const formatterSuites = [
  './formatter/coreFormatting.test',
  './formatter/mssqlFormatting.test',
  './formatter/blockEndings.test',
  './formatter/ifExpressions.test',
  './formatter/queryClauses.test',
  './formatter/parentheses.test',
  './formatter/unionAll.test',
  './formatter/cursorLoops.test',
  './formatter/caseExpressions.test',
  './formatter/exceptions.test',
  './formatter/safetyGuards.test',
  './formatter/statementContinuations.test',
  './formatter/ddlParentheses.test',
];

for (const suite of formatterSuites) {
  require(suite);
}
