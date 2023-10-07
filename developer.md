# Developer notes

## Releasing

### frontend

```bash
yarn version:frontend patch|minor|major

npm version --workspaces-update=false --git-tag-version=true ...
yarn pack:frontend

# Now check that the output of pack looks ok

yarn publish:frontend
```

### builder

```bash
yarn version:builder patch|minor|major
yarn pack:builder

# Now check that the output of pack looks ok

yarn publish:builder
```

### After publish

```bash
git push && git push --tags
```