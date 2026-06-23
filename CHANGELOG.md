# CHANGELOG

## v0.3.1 langium-ai (2026-06-23)

Publishing changes + small improvements (add provenance)

- Publish through CI with provenance
- Automate publishing based on `lai-` and `tools-` tags going forward
- Add `lai eval --list` as an option to list all evaluations _without_ running them
- Improve `lai eval` to take variadic files & dirs without needing `--dir` (which is deprecated & will be phased out)
 
## v0.3.0 langium-ai, v5.0.4 langium-ai-tools (2026-06-16)

### langium-ai (lai)
- Improved Langium service detection logic, to pick up services that were otherwise missed automatically.
In most cases the `lai` skill resolved all of these
- Bundle up the CLI properly
- Properly sync up CLI version with package.json version
- Add `lai init config` and `lai init evals` sub-commands with documentation
- Add `lai eval --dir PATH` as a way to set custom evaluation directories
- Embed templates within the bundle, rather than sourcing externally
- Remove various dependencies that were unneeded (or lead to bundling issues)
- Adds internal release scripts & tools to standardize things going forward

### langium-ai-tools (lib)
- Similar removal of extra dependencies

## v0.2.5 langium-ai

Dependency updates + update reported version in the CLI

## v5.0.3 langium-ai-tools, v0.2.3 langium-ai

Dependency updates and lockfile maintenance.

### Maintenance
- Bump `glob` to v13, `commander` to v14, `ora` to v9, `chalk` to v5.6, `fs-extra` to v11.3
- Update lockfile

## v5.0.2 langium-ai-tools, v0.2.2 langium-ai

Lockfile bump.

## v5.0.1 langium-ai-tools, v0.2.1 langium-ai

Pair of small patch releases to resolve some issues, primarily related to CLI and tools interop.

### Fixes

- Fix an issue with eval suite collection where CLI could report 0 evals for files, despite cases being present
- Correct some wording with regards to 'test' vs. 'eval'
- Bump engines to node22
- Update docs to point to the new skills that were made, rather than the 2 we began with
- Chores for updating dependencies

## v5.0.0 langium-ai-tools, v0.2.0 langium-ai

### Breaking changes
- **Langium is now a peer dependency** — `langium-ai-tools` no longer pins a specific Langium version. Projects must provide their own `langium` (>=4.0.0 <5.0.0). This decouples `langium-ai-tools` releases from Langium releases.
- Evaluations now return a 0–1 score instead of pass/fail
- Decoupled volatile interfaces/types from core package

### New features
- **CLI (`langium-ai`)** — new Commander.js CLI for bootstrapping AI-powered tooling in Langium projects
  - `lai init` — interactive project setup with Langium detection
  - `lai gen descriptor` — generate language descriptors from project analysis
  - `lai gen sysprompt` — synthesize system prompts from descriptors
  - `lai validate` — validate descriptor schema and file paths
  - `lai evaluate` — run `.eval.ts` evaluation suites with verbose mode, custom sysprompts, and progress tracking
  - `lai history` — view past evaluation runs with `--oneline` support
  - `lai show` — inspect evaluation run results
  - `lai compare` — compare two evaluation runs side-by-side
  - `lai stats` — aggregate statistics across runs with tag filtering
  - `lai tag` — tag evaluation runs for tracking
  - `lai export` — export results as CSV or JSON
  - `lai clean` — clean old evaluation runs
  - `lai status` — check project status
- **Evaluation suite API** — vitest-style testing API with `describe`, `evaluation`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, `.skip()`, `.only()`, and `evaluation.each()` for parametrized tests
- **LLM provider support** — pluggable providers for descriptor and sysprompt generation (Claude, OpenAI, Ollama, Gemini, Codex)
- **Agent skills** — added skill documents for coding agents
  - LAI CLI usage skill with workflow guidance
  - Langium framework skill for deep project understanding
  - `/lai-gen-language-skill` for constructing a skill for your DSL
  - `/lai-gen-descriptor` for generating & improving a language descriptor
  - `/lai-gen-sysprompt` for generating & refining a system prompt for your language
  - `/lai-gen-evals` for generating & updating the evaluation suite for your language (builds off of the base from `lai init`)
  - `/lai-gen-mcp` for generating an mcp server for your language
- Automatic Langium project structure detection (grammar, services, validators, built-ins)
- Automatic Claude Code path detection during init
- Prompt to install `langium-ai-tools` during init
- Support for built-in files in descriptors and system prompts
- Descriptor and sysprompt versioning

### General improvements
- Switched to Biome for formatting and oxlint for linting
- Added knip for unused code detection
- Modernized vitest configs; CLI uses forks pool
- CI workflow updated with lint and format checks, Node 24.x
- Comprehensive documentation for generated evaluation files
- Updated and improved READMEs across packages
- npm audit fixes and dependency bumps

## v4.2.1 (2026-03-24)

### General improvements
- Export document syntax analyzer from langium-ai-tools

## v4.2.0 (2026-03-20)

### General improvements
- Updated to track langium 4.2.x
- Fix outdated dependency in MCP package

## v4.1.5

### New features
- Introduced yaml -> evalcase decoder for loading evaluator cases in bulk

### General improvements
- Updated tools readme with evaluation matrix details
- Added tests for evaluator + splitter
- Setup eslint and lint during CI
- Bump pinned node to v24 via nvmrc + direnv
- Move edit distance evaluator from core into examples
- Move levenshtein distance evaluator into examples
- Quiet down stderr reporting on lexer/parser errors
- Update usages without context & mark tags optional
- Update tsconfig + imports
- npm audit fixes
- Ignore local files

## v4.1.4 (2025-12-17)

### New features
- Use protobuf definition to generate language independent types (#9)
- Align langium and lai versions

## v4.1.0 (2025-09-30)

### New features
- Initial LAI MCP server implementation (#7)
- Collect rule call statistics (#8)
  - Added tests for document syntax analyzer
  - Allow setting includeImportedRules and includeHiddenRules

### General improvements
- Move main to track latest langium, 4.1.X
- Bump packages
- Correct install ref on README
- Audit updates
- Added CI build
- Fixed extension usage in document uri

## v0.0.2 (2025-05-13)

### New features
- Add splitter example
- Update splitter with program map functionality
- Added copyrights

### General improvements
- Update examples & exports
- README update
- Clean up other packages with small corrections
- Add launch config

## v0.0.1 (2025-04-17)

### New features
- Initial release of langium-ai and langium-ai-tools