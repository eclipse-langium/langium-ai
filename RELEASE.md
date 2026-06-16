# RELEASE

The following is release guidance for publishing `langium-ai-tools` and `langium-ai` packages.

### Preflight Checks

Checklist before you're ready to push up a release

1. Check for patches or updates that we can take in via `npm audit`
    - npmx.dev is a great way to check for this surface
2. Bump version in package.json for CLI and/or tools accordingly
3. Update version for cli in ./packages/cli/src/index.ts, this should align with the package.json
    - just update the `LAI_CUR_VERSION` line
    - this is done automatically with the `scripts/release-langium-ai.sh` script outlined below
        - i.e `const LAI_CUR_VERSION = "X.Y.Z";` will be automatically replaced w/ the current version when the script runs
4. Update the changelog for both versions, following the prior release format
    - Single release entry, describing both langium-ai and langium-ai-tools releases
    - If there's just one release, you only need to describe that one

### Performing the Release

Both release steps are fairly similar, but the CLI involves syncing the version in the CLI tool with the package version. For clarify, the steps are outlined below, but for brevity, there's 2 scripts you can use to run through this process with pauses in-between. They are **scripts/release-langium-ai-tools.sh** and **scripts/release-langium-ai.sh**.

#### Releasing the CLI

Audit & fix any issues at first, in case new security patches just came out

```bash
npm audit
npm audit fix
```

Update the `LAI_CUR_VERSION` stored in **src/index.ts** to match the current version in the package.json.

```ts
const LAI_CUR_VERSION = 'X.Y.Z';
```

Clean & rebuild the project to ensure there's nothing leftover from before.

```bash
npm run clean
npm run build
```

Check the tests to be sure there's nothing broken.

```bash
npm run test
```

Login to get a short-lived token for publishing one or both packages.
```bash
npm login
```

Perform a _dry run_ publish check, and verify the contents look okay. Ensure there's nothing present that shouldn't be, and the overall size seems reasonable.

```bash
npm publish --dry-run
```

If it all looks good, proceed to publish a fresh release.

```bash
npm publish
```

#### Releasing the Tools (Library)

Exactly the same as releasing the CLI, with the exception that you don't need to update any hardcoded version.