# RELEASE

The following is release guidance for publishing `langium-ai-tools` and `langium-ai` packages.

Publishing is handled by the **Publish** workflow (`.github/workflows/publish.yml`), which is triggered by pushing tags to `main`. The workflow runs CI as a prerequisite, then builds and stages the package on npm via OIDC. You then approve or reject the staged version from npm directly.

## Preflight Checks

Checklist before you're ready to push up a release.

1. Check for patches or updates that we can take in via `npm audit`
    - npmx.dev is a great way to check for this surface
2. Bump version in `package.json` for CLI and/or tools accordingly
3. Regenerate embedded CLI templates via `npm run embed-templates` (within `./packages/cli`)
    - `npm run build` runs this as well
4. Update the changelog for both versions, following the prior release format
    - Single release entry, describing both langium-ai and langium-ai-tools releases
    - If there's just one release, you only need to describe that one

## Performing the Release

Releases are triggered by pushing a tag to `main`. The tag prefix determines which package gets published:

- `tools-X.Y.Z` — publishes `langium-ai-tools` only
- `lai-X.Y.Z` — publishes `langium-ai` (CLI) only

The publish workflow will run CI first (build, lint, format, knip, tests). If CI passes, it builds the packages and stages the publish on npm. You then approve or reject the staged version from the npm website.

### Ordering: when both packages need a release

If the CLI depends on a new version of `langium-ai-tools`, publish tools first, since the CLI depends on that:

1. Push the `tools-X.Y.Z` tag and wait for the workflow to stage it
2. Approve the staged tools version on npm
3. Then push the `lai-X.Y.Z` tag for the CLI

This ensures the CLI's dependency is available on npm before it gets published.

### Step by step

1. Complete all [preflight checks](#preflight-checks)
2. Commit the version bumps and changelog updates to `main`
3. Tag the commit and push:
    ```bash
    # for tools
    git tag tools-X.Y.Z
    git push origin tools-X.Y.Z

    # for cli
    git tag lai-X.Y.Z
    git push origin lai-X.Y.Z
    ```
4. The publish workflow should run automatically
5. Once the workflow succeeds, go to npm to approve (or reject) the staged version

### Manual retrigger via workflow dispatch

If a publish workflow run fails or needs to be re-run without recreating a tag, you can trigger it manually from the GitHub Actions UI:

1. Go to **Actions → Publish → Run workflow**
2. Select the branch or tag to run against (e.g. `lai-0.3.1`)
3. Choose the package to publish (`lai` or `tools`) from the dropdown
4. Click **Run workflow**

This runs the same CI + staged publish pipeline as a tag push, just without needing to delete and re-push the tag.

### Local release scripts (alternative)

For local publishing without the CI workflow, there are interactive scripts with built-in pauses and dry-run checks: **scripts/release-langium-ai-tools.sh** and **scripts/release-langium-ai.sh**. These handle audit, build, test, and publish steps locally. Use these if you need to bypass the CI workflow for any reason.

Note that local releases will _not_ have provenance. This can lead to issues with downstream consumers that won't accept packages that downgrade after being published with provenance.