# Repository Guidelines

## Project Structure & Module Organization
- `cmd/`: CLI entry (`openxapi`).
- `internal/`: core logic
  - `config/`, `exchange/`, `generator/`, `parser/`.
- `configs/exchanges/`: per‑exchange REST/WebSocket config.
- `generator-configs/`: OpenAPI generator configs per language.
- `specs/{exchange}/`: generated specs (`openapi/`, `asyncapi/`).
- `templates/`: SDK templates (REST: Mustache; WS: React/TS).
- `samples/`: cached docs for offline generation.
- `bin/`: built binaries.

## Build, Test, and Development Commands
- `make build`: build `bin/openxapi`.
- `make all`: format, lint, vet, test, build.
- `make format | make lint | make vet`: style and static checks.
- `make test` (or `make unit-test`): run Go tests with `-race`.
- `make test-with-samples`: run tests using `samples/` cache.
- `make coverage`: generate coverage report.
- Spec generation: `make generate-rest-spec EXCHANGE=binance`, `make generate-ws-spec EXCHANGE=binance`, or `make generate-spec EXCHANGE=binance`.
- Validation: `make validate-rest-spec EXCHANGE=binance OPENAPI_GENERATOR_CLI=/path/to/openapi-generator-cli`, `make validate-ws-spec EXCHANGE=binance`.
- SDKs: `make generate-rest-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=../binance-go/rest`; `make generate-ws-sdk EXCHANGE=binance LANGUAGE=go OUTPUT_DIR=../binance-go/ws`.

## Coding Style & Naming Conventions
- Language: Go. Use `make format` (gofmt) and `make lint` (golangci-lint).
- Indentation: Go defaults; keep idiomatic naming and exported doc comments.
- OpenAPI rule: `operationId` must start with `Get|Create|Update|Delete` (see `make validate-rest-spec`).
- WebSocket templates: use handler names like `Handle{EventName}Event` (events), `Handle{ResponseType}` (responses), `Handle{ErrorType}` (errors).

## Testing Guidelines
- Framework: Go `testing`. Files end with `_test.go`, tests `TestXxx`.
- Run: `make test`; with cache: `TEST_WITH_SAMPLES=1 make test-with-samples`.
- Coverage: `make coverage` (opens HTML report).
- Integration tests live in `github.com/openxapi/integration-tests`.

## Commit & Pull Request Guidelines
- Commits: Conventional style `type(scope): description`.
  - Examples: `feat(binance): add futures API`, `fix(parser): handle malformed JSON`.
- Before push: `make format && make test` must pass.
- PRs: clear description, linked issues, rationale; include affected spec/template paths and sample commands to reproduce.

## Security & Configuration Tips
- Never commit secrets. Use env vars for API keys.
- Prefer `samples/` for offline, reproducible generation.
- To prevent auto-regeneration of a fragile endpoint, add to `configs/exchanges/{exchange}/rest.yaml` under `protected_endpoints` and edit `specs/{exchange}/openapi/{module}/...` manually.
- Tools: set `OPENAPI_GENERATOR_CLI` and ensure `asyncapi` CLI is installed for validations and SDK generation.

