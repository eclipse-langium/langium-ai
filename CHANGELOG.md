# CHANGELOG

## v4.1.5 (Unreleased)

### New features
- Introduced yaml -> evalcase decoder for loading evaluator cases in bulk

### General improvements
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