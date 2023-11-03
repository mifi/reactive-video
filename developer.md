# Developer notes

## Releasing

### `reactive-video` (frontend)

```bash
yarn version:frontend patch|minor|major
yarn pack:frontend

# Now check that the output of pack looks ok, then publish
yarn publish:frontend
```

### `@reactive-video/builder`

Note: If you released a new major of `reactive-video` frontend first, run this first (replace `majorversion` with the major semver of `reactive-video`):
```bash
(cd packages/builder && yarn add reactive-video@majorversion && git add package.json && git commit -m 'Upgrade builder reactive-video version')
```

```bash
yarn version:builder patch|minor|major
yarn pack:builder

# Now check that the output of pack looks ok, then publish:
yarn publish:builder
```

### After publish

```bash
git push && git push --tags
```
