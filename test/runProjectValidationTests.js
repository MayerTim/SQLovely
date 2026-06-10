const fs = require('fs');
const path = require('path');
const { assert, runTest } = require('./helpers/runTest');

const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

runTest('project manifest and grammar configuration are internally consistent', () => {
  const manifest = readJson('package.json');
  const grammarContribution = manifest.contributes.grammars[0];
  const grammarPath = grammarContribution.path.replace(/^\.\//u, '');
  const grammar = readJson(grammarPath);

  assert.equal(manifest.name, 'sqlovely');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.repository.url, 'https://github.com/MayerTim/SQLovely.git');
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'private'));
  assert.ok(exists('LICENSE'));
  assert.equal(manifest.main, './dist/extension.js');
  assert.ok(exists('dist/extension.js'));
  assert.equal(grammarContribution.language, 'sql');
  assert.equal(grammarContribution.scopeName, 'source.sql.sqlovely');
  assert.equal(grammar.scopeName, grammarContribution.scopeName);
  assert.equal(grammar.name, 'SQLovely SQL');
});

runTest('language contribution keeps .sql as the SQLovely default', () => {
  const manifest = readJson('package.json');
  const languageContribution = manifest.contributes.languages[0];

  assert.equal(languageContribution.id, 'sql');
  assert.ok(languageContribution.extensions.includes('.sql'));
  assert.ok(languageContribution.aliases.includes('SQLovely SQL'));
  assert.equal(languageContribution.configuration, './language-configuration.json');
  assert.ok(exists('language-configuration.json'));
});

runTest('dialect and formatter settings have safe defaults', () => {
  const manifest = readJson('package.json');
  const properties = manifest.contributes.configuration.properties;

  assert.equal(properties['sqlovely.dialect'].default, 'watcom');
  assert.deepEqual(properties['sqlovely.dialect'].enum, ['watcom', 'mssql']);
  assert.equal(properties['sqlovely.dialect'].scope, 'resource');
  assert.equal(properties['sqlovely.format.enabled'].default, true);
  assert.equal(properties['sqlovely.format.indentSize'].default, 2);
  assert.equal(properties['sqlovely.format.indentSize'].scope, 'resource');
  assert.equal(properties['sqlovely.format.insertSpaces'].default, true);
  assert.equal(properties['sqlovely.format.insertSpaces'].scope, 'resource');
  assert.equal(properties['sqlovely.extras.applyOnSave'].default, false);
  assert.equal(properties['sqlovely.extras.applyWithFormatting'].default, true);
  assert.equal(properties['sqlovely.extras.applyWithFormatting'].scope, 'resource');
  assert.equal(properties['sqlovely.extras.metadataHeader.enabled'].default, true);
  assert.equal(properties['sqlovely.diagnostics.enabled'].default, true);
  assert.equal(properties['sqlovely.diagnostics.enabled'].scope, 'resource');
  assert.equal(properties['sqlovely.diagnostics.missingMetadataHeader.enabled'].default, true);
  assert.equal(properties['sqlovely.diagnostics.missingMetadataHeader.enabled'].scope, 'resource');
  assert.equal(properties['sqlovely.diagnostics.maxLineLength.enabled'].default, true);
  assert.equal(properties['sqlovely.diagnostics.maxLineLength.limit'].default, 120);
  assert.equal(properties['sqlovely.diagnostics.maxLineLength.limit'].scope, 'resource');
});

runTest('all contributed commands have activation events and compiled handlers', () => {
  const manifest = readJson('package.json');
  const activationEvents = new Set(manifest.activationEvents);
  const commandFiles = new Map([
    ['sqlovely.showActiveDialect', 'dist/commands/showActiveDialect.js'],
    ['sqlovely.switchDialect', 'dist/commands/switchDialect.js'],
    ['sqlovely.formatCurrentFile', 'dist/commands/formatCurrentFile.js'],
    ['sqlovely.formatSqlFilesInDirectory', 'dist/commands/formatSqlFilesInDirectory.js'],
    ['sqlovely.insertOrUpdateMetadataHeader', 'dist/commands/insertOrUpdateMetadataHeader.js'],
    ['sqlovely.applyExtras', 'dist/commands/applyExtras.js'],
  ]);

  for (const contribution of manifest.contributes.commands) {
    assert.ok(activationEvents.has(`onCommand:${contribution.command}`));
    assert.ok(commandFiles.has(contribution.command));
    assert.ok(exists(commandFiles.get(contribution.command)));
  }
});

runTest('registers diagnostics and code action runtime files', () => {
  assert.ok(exists('dist/diagnostics/metadataHeaderDiagnostics.js'));
  assert.ok(exists('dist/diagnostics/lineLengthDiagnostics.js'));
  assert.ok(exists('dist/diagnostics/documentDiagnostics.js'));
  assert.ok(exists('dist/diagnostics/index.js'));
  assert.ok(exists('dist/codeActions/metadataHeaderCodeActions.js'));
  assert.ok(exists('dist/codeActions/index.js'));
});

runTest('MSSQL dialect has a rudimentary migration-ready surface', () => {
  const { mssqlDialect } = require('../dist/dialects/mssql/dialect');

  assert.equal(mssqlDialect.id, 'mssql');
  assert.ok(mssqlDialect.keywords.has('go'));
  assert.ok(mssqlDialect.keywords.has('try'));
  assert.ok(mssqlDialect.keywords.has('catch'));
  assert.ok(mssqlDialect.keywords.has('merge'));
  assert.ok(mssqlDialect.builtinFunctions.has('sysdatetime'));
  assert.ok(mssqlDialect.builtinFunctions.has('row_number'));
  assert.ok(mssqlDialect.batchSeparators.has('go'));
});

runTest('VSIX packaging scripts are available and keep package output isolated', () => {
  const manifest = readJson('package.json');
  const vscodeIgnore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');

  assert.ok(manifest.devDependencies['@vscode/vsce']);
  assert.equal(manifest.scripts.validate, 'npm run check && npm test');
  assert.equal(
    manifest.scripts['package:vsix'],
    'npm run validate && node ./scripts/packageVsix.js',
  );
  assert.ok(exists('scripts/packageVsix.js'));
  assert.ok(vscodeIgnore.includes('scripts/**'));
  assert.ok(vscodeIgnore.includes('out/**'));
  assert.ok(vscodeIgnore.includes('PACKAGING.md'));
  assert.ok(vscodeIgnore.includes('dist/**/*.map'));

  const packageScript = fs.readFileSync(path.join(root, 'scripts/packageVsix.js'), 'utf8');
  assert.ok(packageScript.includes('--no-dependencies'));
  assert.ok(!packageScript.includes('--allow-missing-repository'));
});

runTest('documentation and onboarding examples are present', () => {
  const requiredDocs = ['docs/DEVELOPMENT.md', 'docs/SQL_IMPLEMENTATION.md', 'PACKAGING.md'];

  for (const doc of requiredDocs) {
    assert.ok(exists(doc), `${doc} should exist`);
  }

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const doc of requiredDocs) {
    assert.ok(readme.includes(doc), `README should link to ${doc}`);
  }
  assert.ok(readme.includes('MIT'));

  const oldDocs = [
    'docs/GETTING_STARTED.md',
    'docs/WORKSPACE_SETTINGS.md',
    'docs/SYNTAX_GRAMMAR.md',
    'docs/SQL_COVERAGE.md',
  ];

  for (const doc of oldDocs) {
    assert.ok(!exists(doc), `${doc} should be consolidated`);
  }

  const contributing = fs.readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
  assert.ok(contributing.includes('docs/DEVELOPMENT.md'));
  assert.ok(contributing.includes('docs/SQL_IMPLEMENTATION.md'));
});

runTest('example settings and SQL smoke-test files are valid project assets', () => {
  const exampleSettings = [
    'examples/settings/watcom-conservative.settings.json',
    'examples/settings/watcom-format-on-save.settings.json',
    'examples/settings/mssql-sandbox.settings.json',
  ];

  for (const file of exampleSettings) {
    assert.ok(exists(file), `${file} should exist`);
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  }

  assert.ok(exists('examples/sql/watcom-procedure.sql'));
  assert.ok(exists('examples/sql/mssql-procedure.sql'));

  const watcomExample = fs.readFileSync(
    path.join(root, 'examples/sql/watcom-procedure.sql'),
    'utf8',
  );
  const mssqlExample = fs.readFileSync(path.join(root, 'examples/sql/mssql-procedure.sql'), 'utf8');

  assert.ok(/create\s+procedure/i.test(watcomExample));
  assert.ok(/elseif|endif|begin/i.test(watcomExample));
  assert.ok(/create\s+or\s+alter\s+proc/i.test(mssqlExample));
  assert.ok(/\bgo\b/i.test(mssqlExample));
});

runTest('project package hygiene rules exclude local-only files from distributable output', () => {
  const vscodeIgnore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');
  const gitIgnore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

  assert.ok(vscodeIgnore.includes('node_modules/**'));
  assert.ok(vscodeIgnore.includes('src/**'));
  assert.ok(vscodeIgnore.includes('test/**'));
  assert.ok(vscodeIgnore.includes('scripts/**'));
  assert.ok(vscodeIgnore.includes('out/**'));
  assert.ok(vscodeIgnore.includes('*.vsix'));
  assert.ok(vscodeIgnore.includes('*.zip'));
  assert.ok(vscodeIgnore.includes('sqlovely_private_companion_pack*/**'));
  assert.ok(!vscodeIgnore.split('\n').includes('dist/**'));

  assert.ok(gitIgnore.includes('node_modules/'));
  assert.ok(gitIgnore.includes('dist/'));
  assert.ok(gitIgnore.includes('out/'));
  assert.ok(gitIgnore.includes('*.vsix'));
  assert.ok(gitIgnore.includes('*.zip'));
  assert.ok(gitIgnore.includes('sqlovely_private_companion_pack*/'));
});

runTest('SQLovely grammar exposes the expected repository sections', () => {
  const grammar = readJson('syntaxes/sqlovely.tmLanguage.json');
  const repositories = Object.keys(grammar.repository || {});

  assert.equal(grammar.name, 'SQLovely SQL');
  assert.equal(grammar.scopeName, 'source.sql.sqlovely');
  assert.ok(repositories.includes('metadataHeader'));
  assert.ok(repositories.includes('comments'));
  assert.ok(repositories.includes('strings'));
  assert.ok(repositories.includes('delimitedIdentifiers'));
  assert.ok(repositories.includes('variables'));
  assert.ok(repositories.includes('objectDeclarations'));
  assert.ok(repositories.includes('dataTypes'));
  assert.ok(repositories.includes('functions'));
  assert.ok(repositories.includes('keywords'));
  assert.ok(repositories.includes('operators'));
});

runTest('SQLovely grammar gives generated metadata headers semantic scopes', () => {
  const grammarText = fs.readFileSync(path.join(root, 'syntaxes/sqlovely.tmLanguage.json'), 'utf8');

  for (const fragment of [
    'comment.block.metadata.sqlovely.sql',
    'entity.name.section.metadata.begin.sqlovely.sql',
    'entity.name.section.metadata.end.sqlovely.sql',
    'variable.other.property.metadata-field.sqlovely.sql',
    'punctuation.separator.key-value.metadata.sqlovely.sql',
    'constant.numeric.version.metadata.sqlovely.sql',
    'constant.other.date.metadata.sqlovely.sql',
    'comment.line.todo.metadata.placeholder.sqlovely.sql',
    'meta.field.description.continuation.metadata.sqlovely.sql',
    'meta.field.updated-by.metadata.sqlovely.sql',
    'entity.name.other.updater.metadata.sqlovely.sql',
    'meta.history-entry.metadata.sqlovely.sql',
  ]) {
    assert.ok(grammarText.includes(fragment), `metadata grammar should include ${fragment}`);
  }
});

runTest('SQLovely grammar includes audited SQL lexical categories', () => {
  const grammarText = fs
    .readFileSync(path.join(root, 'syntaxes/sqlovely.tmLanguage.json'), 'utf8')
    .toLowerCase();

  for (const fragment of [
    'begin\\\\s+atomic',
    'on\\\\s+exception\\\\s+resume',
    'elseif',
    'resignal',
    'synchronization\\\\s+profile',
    'materialized\\\\s+view',
    'long\\\\s+varchar',
    'unsigned\\\\s+integer',
    'current\\\\s+timestamp',
    'outer\\\\s+apply',
    'create\\\\s+or\\\\s+alter',
    'keyword.other.batch-separator',
    'variable.parameter.host',
    'entity.name.identifier.bracketed',
  ]) {
    assert.ok(grammarText.includes(fragment), `grammar should include ${fragment}`);
  }
});

runTest(
  'SQLovely grammar scopes quoted built-in function calls before generic quoted identifiers',
  () => {
    const grammar = readJson('syntaxes/sqlovely.tmLanguage.json');
    const topLevelIncludes = grammar.patterns.map((pattern) => pattern.include).filter(Boolean);
    const quotedFunctionIndex = topLevelIncludes.indexOf('#quotedBuiltinFunctions');
    const delimitedIdentifierIndex = topLevelIncludes.indexOf('#delimitedIdentifiers');
    const pattern = grammar.repository.quotedBuiltinFunctions.patterns[0];

    assert.ok(quotedFunctionIndex >= 0, 'quoted built-in function matcher should be included');
    assert.ok(
      delimitedIdentifierIndex >= 0,
      'generic quoted identifier matcher should be included',
    );
    assert.ok(
      quotedFunctionIndex < delimitedIdentifierIndex,
      'quoted built-in function matcher must run before generic quoted identifiers',
    );
    assert.equal(pattern.name, 'support.function.builtin.quoted.sql.sqlovely');

    for (const builtin of [
      'isnull',
      'string',
      'date',
      'substr',
      'xmlelement',
      'xmlserialize',
      'row_number',
    ]) {
      assert.ok(
        pattern.match.toLowerCase().includes(builtin),
        `quoted function matcher should include ${builtin}`,
      );
    }

    assert.equal(pattern.captures['2'].name, 'support.function.builtin.sql.sqlovely');
  },
);
