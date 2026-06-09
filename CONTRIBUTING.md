# Contributing

Thank you for considering a contribution to SQLovely.

## Before opening a pull request

Run the standard validation commands:

```bash
npm ci
npm run check
npm test
npm run package:vsix
```

## Guidelines

- Keep formatter behavior conservative.
- Add regression tests for behavior changes.
- Keep `README.md` user-facing.
- Put maintainer/developer details in `docs/`.
- Update `CHANGELOG.md` for user-visible changes.

For development setup and implementation notes, see:

- `docs/DEVELOPMENT.md`
- `docs/SQL_IMPLEMENTATION.md`
- `PACKAGING.md`
