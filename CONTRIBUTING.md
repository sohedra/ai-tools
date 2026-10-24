# Contributing

Read [AGENTS.md](AGENTS.md) first. It holds the repo conventions: plugin layout, manifests, marketplace registration and commit format.

```bash
pnpm install
pnpm format        # format
pnpm check         # format check + validation + tests
```

- Branch from `main` and open a pull request. The PR title must follow [Conventional Commits](https://www.conventionalcommits.org) (`feat(<plugin>): ...`). PRs are squash-merged.
- Run `pnpm check` before pushing. CI runs the same checks.
- Never commit secrets, `.env` files or private references. The repo is public.
