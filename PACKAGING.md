# Packaging

Build and validate the extension package with:

```bash
npm install
npm run package:vsix
```

The VSIX is written to `out/` using the extension name and version from `package.json`.

Install locally with:

```bash
code --install-extension out/sqlovely-*.vsix
```

The package script runs type checking, tests and compilation before invoking the local VSCE binary. The project is published under the MIT license.

## Release checklist

Before publishing or attaching a VSIX to a release:

1. Update `CHANGELOG.md`.
2. Confirm the version in `package.json`.
3. Run `npm ci`.
4. Run `npm run check`.
5. Run `npm test`.
6. Run `npm run package:vsix`.
7. Install the generated VSIX in VS Code and open a `.sql` file.
8. Verify highlighting, the active dialect command, formatting, metadata-header quick fixes and the packaging output.
9. Smoke-test metadata headers for multi-object scripts, legacy-header migration, description wrapping, date normalization and `Updated By` values.
