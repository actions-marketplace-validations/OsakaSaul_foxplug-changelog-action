# foxplug

Every release or push becomes a changelog entry and ready-to-post launch updates, waiting in FoxPlug for you to approve. For GitLab CI, Bitbucket Pipelines, CircleCI, any other CI, or your terminal. On GitHub, use the [GitHub Action](https://github.com/marketplace/actions/foxplug-changelog-and-launch-posts) instead.

A live example: [FoxPlug's own changelog](https://foxplug.com/changelog/foxplug/?utm_source=npm&utm_medium=readme&utm_campaign=foxplug_npm), written by FoxPlug from its own commits.

Free for one project. Plans: [foxplug.com/pricing](https://foxplug.com/pricing?utm_source=npm&utm_medium=readme&utm_campaign=foxplug_npm).

## Set it up

1. **[Get your token](https://foxplug.com/app/?connect=github-action&utm_source=npm&utm_medium=readme&utm_campaign=foxplug_npm)**. This opens the token row of your FoxPlug project (you sign up or sign in first if you need to). Press **Create a token**. It is shown once.
2. Save it in your CI as a secret (masked) variable named `FOXPLUG_TOKEN`.
3. Add one step after your build:

**GitLab CI** (`.gitlab-ci.yml`)

```yaml
foxplug:
  image: node:22-alpine
  before_script: [apk add --no-cache git]
  script: [npx -y foxplug@1]
  rules:
    - if: $CI_COMMIT_TAG
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

**Bitbucket Pipelines** (`bitbucket-pipelines.yml`)

```yaml
pipelines:
  branches:
    main:
      - step: { name: FoxPlug, image: node:22, script: [npx -y foxplug@1] }
  tags:
    '*':
      - step: { name: FoxPlug, image: node:22, script: [npx -y foxplug@1] }
```

**CircleCI** (a step in any job that has your code checked out and Node 18 or newer)

```yaml
- run: npx -y foxplug@1
```

**Your terminal**, from the repository's folder:

```sh
FOXPLUG_TOKEN=... npx foxplug                 # today's commits
FOXPLUG_TOKEN=... npx foxplug --release v1.4.0
```

That's it. The next release shows up in FoxPlug as a draft and a changelog entry, waiting for you. Commits are gathered by day: a single commit on its own waits until the next push that day joins it.

What it looks like once you publish:

[![A changelog written by FoxPlug from a repository's commits](https://raw.githubusercontent.com/OsakaSaul/foxplug-changelog-action/main/docs/example-changelog.png)](https://foxplug.com/changelog/foxplug/?utm_source=npm&utm_medium=readme&utm_campaign=foxplug_npm)

## What it sends

- **On a release tag** (found automatically when GitLab, Bitbucket, CircleCI or GitHub builds a tag, or passed with `--release`): the tag, its name, its notes and its link. The notes are the commit subjects since the previous tag, or a file you pass with `--notes`.
- **Otherwise**: the subject line of each commit in this push (GitLab gives the push's range), or of today's commits.
- FoxPlug writes a changelog entry and launch posts from it, as drafts. **Nothing is posted until you approve it.**
- The command prints in one sentence what happened, for example that a draft is waiting.

**Nothing else leaves the machine: no source code, no secrets, no environment.** `npx foxplug --dry-run` prints exactly what would be sent. The command is one file with no dependencies, [foxplug.js](https://github.com/OsakaSaul/foxplug-changelog-action/blob/main/cli/foxplug.js).

## Options

| Option | What it is |
| --- | --- |
| `--release <tag>` | Send this tag as a release. |
| `--notes <file>` | Release notes from a file. |
| `--since <ref>` | Send the commits after this ref. |
| `--repo <owner/name>` | The repository name, if it cannot be read from git or CI. |
| `--project <name>` | Your FoxPlug project name, as a check that the token is the one you meant. |
| `--dry-run` | Print what would be sent; send nothing. |

A wrong or revoked token stops the step with a message. FoxPlug being unreachable never fails your build.

## Revoking

Revoke the token in your FoxPlug project at any time; the next run then stops with a message saying so.

## Licence

MIT
