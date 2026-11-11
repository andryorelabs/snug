# Repository settings and rulesets

The GitHub settings of `andryorelabs/snug` live in this folder as reviewable
files. The live repository is brought to match the files, never edited by hand
first.

- [`develop.json`](develop.json): the ruleset on the `develop` branch.
- [`main.json`](main.json): the ruleset on the default branch, which only
  accepts promotions from `develop`.
- [`tags.json`](tags.json): the ruleset on `v*` tags.
- The table below: every other repository setting this project depends on.

`scripts/repo-settings/check.ts` reads the live repository through `gh api` (GET
requests only) and compares it with these files. It prints one line per
difference and exits non-zero when there is any:

```sh
bun scripts/repo-settings/check.ts
```

Reading `security_and_analysis` needs a token with admin access to the
repository; without it those rows are reported as absent.

## Rulesets

The files use the import format of the
[repository rulesets API](https://docs.github.com/en/rest/repos/rules), so each
file is the request body as is.

| File           | Target                       | Rules                                                                                                                                                                                                              | Bypass actors |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `develop.json` | Branch `refs/heads/develop`  | No deletion, no force push, linear history, signed commits, pull request required (squash only, threads resolved, 0 approvals), strict required checks `CI passed`, `Validate PR title` and `Check markdown links` | None          |
| `main.json`    | Default branch               | No deletion, no force push, signed commits, pull request required (merge commit only, threads resolved, 0 approvals), non-strict required checks `CI passed`, `Validate PR title` and `Check markdown links`       | None          |
| `tags.json`    | Tags matching `refs/tags/v*` | No deletion, no force push, no update                                                                                                                                                                              | None          |

`main` drops linear history and the strict policy because a promotion is a
merge commit from `develop`, which `main` never has to be rebased onto. See
[ADR 0040](../../docs/adr/0040-develop-branch-promoted-by-merge-commit.md).

`scripts/rulesets.test.ts` fails when a required check names no workflow job.

Read the live rulesets back:

```sh
gh api repos/andryorelabs/snug/rulesets
gh api repos/andryorelabs/snug/rulesets/<id>
```

Apply a ruleset file to the existing ruleset of the same name:

```sh
gh api --method PUT \
  "repos/andryorelabs/snug/rulesets/$(gh api repos/andryorelabs/snug/rulesets --jq '.[] | select(.name == "develop") | .id')" \
  --input .github/rulesets/develop.json

gh api --method PUT \
  "repos/andryorelabs/snug/rulesets/$(gh api repos/andryorelabs/snug/rulesets --jq '.[] | select(.name == "main") | .id')" \
  --input .github/rulesets/main.json

gh api --method PUT \
  "repos/andryorelabs/snug/rulesets/$(gh api repos/andryorelabs/snug/rulesets --jq '.[] | select(.name == "tags") | .id')" \
  --input .github/rulesets/tags.json
```

Create the `develop` ruleset, then update `main` to promotion-only:

```sh
gh api --method POST repos/andryorelabs/snug/rulesets --input .github/rulesets/develop.json

gh api --method PUT \
  "repos/andryorelabs/snug/rulesets/$(gh api repos/andryorelabs/snug/rulesets --jq '.[] | select(.name == "main") | .id')" \
  --input .github/rulesets/main.json
```

Create a ruleset that does not exist yet:

```sh
gh api --method POST repos/andryorelabs/snug/rulesets --input .github/rulesets/develop.json
gh api --method POST repos/andryorelabs/snug/rulesets --input .github/rulesets/main.json
gh api --method POST repos/andryorelabs/snug/rulesets --input .github/rulesets/tags.json
```

## Expected settings

The check reads this table: the first cell is the path of the value in the live
output, the second is its expected JSON value. Keep both in backticks.

| Setting                                                        | Expected     | Meaning                                 |
| -------------------------------------------------------------- | ------------ | --------------------------------------- |
| `allow_squash_merge`                                           | `true`       | Squash merging is allowed               |
| `allow_merge_commit`                                           | `true`       | Merge commits are on, for promotions    |
| `allow_rebase_merge`                                           | `false`      | Rebase merging is off                   |
| `squash_merge_commit_title`                                    | `"PR_TITLE"` | The squash commit title is the PR title |
| `squash_merge_commit_message`                                  | `"PR_BODY"`  | The squash commit body is the PR body   |
| `merge_commit_title`                                           | `"PR_TITLE"` | The merge commit title is the PR title  |
| `merge_commit_message`                                         | `"PR_BODY"`  | The merge commit body is the PR body    |
| `delete_branch_on_merge`                                       | `true`       | Head branches are deleted on merge      |
| `allow_auto_merge`                                             | `true`       | Auto-merge is available                 |
| `allow_update_branch`                                          | `true`       | PRs offer "Update branch"               |
| `has_wiki`                                                     | `false`      | The wiki is off                         |
| `has_projects`                                                 | `false`      | Projects are off                        |
| `has_discussions`                                              | `false`      | Discussions are off                     |
| `security_and_analysis.secret_scanning.status`                 | `"enabled"`  | Secret scanning is on                   |
| `security_and_analysis.secret_scanning_push_protection.status` | `"enabled"`  | Push protection is on                   |
| `security_and_analysis.dependabot_security_updates.status`     | `"enabled"`  | Dependabot security updates are on      |
| `vulnerability_alerts.enabled`                                 | `true`       | Dependabot alerts are on                |
| `private_vulnerability_reporting.enabled`                      | `true`       | Private vulnerability reporting is on   |

`vulnerability_alerts.enabled` and `private_vulnerability_reporting.enabled` are
not fields of the repository object. The check fills them from their own
endpoints, listed under "Read back" below.

### Read back

```sh
gh api repos/andryorelabs/snug \
  --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, squash_merge_commit_title, squash_merge_commit_message, merge_commit_title, merge_commit_message, delete_branch_on_merge, allow_auto_merge, allow_update_branch, has_wiki, has_projects, has_discussions, security_and_analysis}'

gh api repos/andryorelabs/snug/private-vulnerability-reporting

# Answers 204 when Dependabot alerts are on, 404 when they are off.
gh api repos/andryorelabs/snug/vulnerability-alerts --silent
```

### Apply

Merge, feature and security-analysis settings:

```sh
gh api --method PATCH repos/andryorelabs/snug --input - <<'JSON'
{
  "allow_squash_merge": true,
  "allow_merge_commit": true,
  "merge_commit_title": "PR_TITLE",
  "merge_commit_message": "PR_BODY",
  "allow_rebase_merge": false,
  "squash_merge_commit_title": "PR_TITLE",
  "squash_merge_commit_message": "PR_BODY",
  "delete_branch_on_merge": true,
  "allow_auto_merge": true,
  "allow_update_branch": true,
  "has_wiki": false,
  "has_projects": false,
  "has_discussions": false,
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON
```

Dependabot alerts, then Dependabot security updates (alerts must be on first):

```sh
gh api --method PUT repos/andryorelabs/snug/vulnerability-alerts
gh api --method PUT repos/andryorelabs/snug/automated-security-fixes
```

Private vulnerability reporting:

```sh
gh api --method PUT repos/andryorelabs/snug/private-vulnerability-reporting
```
