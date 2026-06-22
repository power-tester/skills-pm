# power-tester/skills

The central skills manifest for this organisation. [`skills.yml`](./skills.yml) is the single
source of truth — it lists every skill and the upstream GitHub repo that owns it.
Consumers install skills directly from those upstream repos; nothing is committed here except the manifest.

Target agent: **Claude Code**. Install scope: **global** (applies across all of a user's projects).

```
.
├── skills.yml          # source of truth — list of skills and their upstream repos
├── bin/skills-pm.js    # the @pramodyadav027/skills-pm CLI
└── package.json        # npm package definition
```

> `skills/` is **git-ignored** — it is a generated directory produced by `npx @pramodyadav027/skills-pm fetch` and used for local review only.

---

## For consumers

Consumers are developers or projects that want to install these skills into Claude Code.
No checkout of this repo is required.

### Install / sync skills

```bash
npx @pramodyadav027/skills-pm sync
```

This reads `skills.yml` from GitHub, then installs each skill directly from its declared
upstream repo. Skills with a `select` list install only those specific skills; entries
without `select` install everything from that repo.

Pin to a specific branch or tag instead of `main`:

```bash
npx @pramodyadav027/skills-pm sync --ref v2
```

### Other consumer commands

```bash
npx @pramodyadav027/skills-pm list     # list installed skills
npx @pramodyadav027/skills-pm remove   # remove all skills installed from this manifest
```

---

## For maintainers

Maintainers are people who manage this repo — adding, removing, or updating entries in `skills.yml`.

### Add a skill

Edit `skills.yml` and add an entry:

```yaml
- repo: some-org/some-skills-repo   # GitHub repo that contains the SKILL.md
  path: .                           # path within the repo where skill subdirs live
  ref: main                         # branch, tag, or commit SHA
  enabled: true
  select:                           # optional: omit to install all skills from the repo
    - skill-name-a
    - skill-name-b
```

Open a PR. When merged, consumers running `sync` will pick it up on their next run.

### Remove or disable a skill

- **Disable temporarily:** set `enabled: false` on the entry.
- **Remove permanently:** delete the entry from `skills.yml`.

### Preview skill files locally

Pull the SKILL.md files to a local `skills/` directory for review before adding an entry:

```bash
# from inside this repo
npm run fetch
```

This reads the local `skills.yml`, downloads each selected skill's `SKILL.md` from its
upstream repo, and writes them to `skills/<name>/SKILL.md`. The `skills/` directory is
git-ignored — it is for inspection only.

### Publish a new version

After merging changes to `skills.yml`, bump the version and publish to npm so consumers
get the update:

```bash
npm version patch   # or minor / major
npm publish
```

Tag the repo if you want consumers to be able to pin to a stable release:

```bash
git tag v2 && git push --tags
```

Consumers can then pin with `npx @pramodyadav027/skills-pm sync --ref v2`.
