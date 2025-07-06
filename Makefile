.PHONY: all build clean format lint vet test unit-test coverage help test-with-samples generate-spec generate-sdk generate-rest-spec generate-ws-spec validate-rest-spec validate-ws-spec generate-rest-sdk

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOVET=$(GOCMD) vet
GOLIST=$(GOCMD) list ./... | grep -v 'test/project' | grep -v 'templates/.*/tests/integration'
BIN_DIR=bin
BINARY_NAME=$(BIN_DIR)/openxapi


all: format lint vet test build

build:
	@$(GOBUILD) -o $(BINARY_NAME) -v ./cmd/openxapi

generate-spec:
	@make build
	@if [ -n "${EXCHANGE}" ]; then \
		$(BINARY_NAME) -exchange ${EXCHANGE}; \
	else \
		$(BINARY_NAME); \
	fi

generate-rest-spec:
	@make build
	@if [ -n "${EXCHANGE}" ]; then \
		$(BINARY_NAME) -exchange ${EXCHANGE} -spec-type rest; \
	else \
		$(BINARY_NAME) -spec-type rest; \
	fi

generate-ws-spec:
	@make build
	@if [ -n "${EXCHANGE}" ]; then \
		$(BINARY_NAME) -exchange ${EXCHANGE} -spec-type ws; \
	else \
		$(BINARY_NAME) -spec-type ws; \
	fi

validate-rest-spec:
	@if [ -z "${EXCHANGE}" ]; then \
		echo "Usage: make validate-rest-spec EXCHANGE=<exchange>"; \
		exit 1; \
	fi
	@echo "Checking for invalid operationId in ${EXCHANGE} specs"
	@invalid_specs=$$(grep -L -E 'operationId: (Get|Create|Update|Delete)' specs/${EXCHANGE}/openapi/*/*.yaml || true); \
	if [ -n "$${invalid_specs}" ]; then \
		echo "Invalid operationId in the following specs:"; \
		echo "$${invalid_specs}"; \
		echo "Please make sure the operationId starts with Get|Create|Update|Delete"; \
		exit 1; \
	fi
	@echo "Checking for OpenAPI spec in ${EXCHANGE} specs"
	@if [ -z "${OPENAPI_GENERATOR_CLI}" ]; then \
		echo "OPENAPI_GENERATOR_CLI is not set. Please set it to the path of the openapi-generator-cli executable."; \
		exit 1; \
	fi
	@for file in $(shell find specs/${EXCHANGE}/openapi -name "*.yaml" -depth 1); do \
		echo "Validating ${EXCHANGE} spec for $$file"; \
		$(OPENAPI_GENERATOR_CLI) validate -i $$file; \
	done

validate-ws-spec:
	@if [ -z "${EXCHANGE}" ]; then \
		echo "Usage: make validate-ws-spec EXCHANGE=<exchange>"; \
		exit 1; \
	fi
	@echo "Checking for AsyncAPI spec in ${EXCHANGE} specs"
	@if [ -z "${ASYNCAPI_CLI}" ]; then \
		echo "ASYNCAPI_CLI is not set. Please set it to the path of the asyncapi-cli executable."; \
		exit 1; \
	fi
	@for file in $(shell find specs/${EXCHANGE}/asyncapi -name "*.yaml" -depth 1); do \
		echo "Validating ${EXCHANGE} spec for $$file"; \
		$(ASYNCAPI_CLI) validate $$file; \
	done

generate-rest-sdk:
	@if [ -z "${EXCHANGE}" -o -z "${LANGUAGE}" -o -z "${OUTPUT_DIR}" ]; then \
		echo "Usage: make generate-rest-sdk EXCHANGE=<exchange> LANGUAGE=<language> OUTPUT_DIR=<output_dir>"; \
		exit 1; \
	fi
	@if [ -z "${OPENAPI_GENERATOR_CLI}" ]; then \
		echo "OPENAPI_GENERATOR_CLI is not set. Please set it to the path of the openapi-generator-cli executable."; \
		exit 1; \
	fi
	@if [ "${EXCHANGE}" == "binance" ]; then \
		if [ "${LANGUAGE}" == "js" ]; then \
			for file in $(shell find generator-configs/${EXCHANGE}/openapi/js -name "*.yaml"); do \
				echo "Generating ${EXCHANGE} js SDK for $$file"; \
				subdir=$$(echo "$$file" | sed -n 's|.*js/\(.*\)\.yaml|\1|p'); \
				REAL_OUTPUT_DIR=${REAL_OUTPUT_DIR:-${OUTPUT_DIR}} \
				rm -rf ${REAL_OUTPUT_DIR}/src/$$subdir; \
				$(OPENAPI_GENERATOR_CLI) generate -c $$file -g typescript-axios -o ${OUTPUT_DIR}/src/$$subdir; \
			done \
		elif [ "${LANGUAGE}" == "go" ]; then \
			for file in $(shell find generator-configs/${EXCHANGE}/openapi/go -name "*.yaml"); do \
				echo "Generating ${EXCHANGE} go SDK for $$file"; \
				subdir=$$(echo "$$file" | sed -n 's|.*go/\(.*\)\.yaml|\1|p'); \
				REAL_OUTPUT_DIR=${REAL_OUTPUT_DIR:-${OUTPUT_DIR}} \
				rm -rf ${REAL_OUTPUT_DIR}/$$subdir; \
				$(OPENAPI_GENERATOR_CLI) generate -c $$file -g go -o ${OUTPUT_DIR}/$$subdir; \
			done \
		elif [ "${LANGUAGE}" == "python" ]; then \
			for file in $(shell find generator-configs/${EXCHANGE}/openapi/python -name "*.yaml"); do \
				echo "Generating ${EXCHANGE} python SDK for $$file"; \
				subdir=$$(echo "$$file" | sed -n 's|.*python/\(.*\)\.yaml|\1|p'); \
				REAL_OUTPUT_DIR=${REAL_OUTPUT_DIR:-${OUTPUT_DIR}} \
				rm -rf ${REAL_OUTPUT_DIR}/binance/$$subdir; \
				$(OPENAPI_GENERATOR_CLI) generate -c $$file -g python -o ${OUTPUT_DIR}; \
			done \
		elif [ "${LANGUAGE}" == "rust" ]; then \
			for file in $(shell find generator-configs/${EXCHANGE}/openapi/rust -name "*.yaml"); do \
				subdir=$$(echo "$$file" | sed -n 's|.*rust/\(.*\)\.yaml|\1|p'); \
				echo "Generating ${EXCHANGE} rust SDK for $$subdir"; \
				REAL_OUTPUT_DIR=${REAL_OUTPUT_DIR:-${OUTPUT_DIR}} \
				$(OPENAPI_GENERATOR_CLI) generate -c $$file -g rust -o ${OUTPUT_DIR}/src/$${subdir}.tmp; \
				rm -rf $${REAL_OUTPUT_DIR}/src/$${subdir} $${REAL_OUTPUT_DIR}/docs/$${subdir}; \
				mv $${REAL_OUTPUT_DIR}/src/$${subdir}.tmp/src $${REAL_OUTPUT_DIR}/src/$$subdir; \
				mv $${REAL_OUTPUT_DIR}/src/$$subdir/lib.rs $${REAL_OUTPUT_DIR}/src/$$subdir/mod.rs; \
				mkdir -p $${REAL_OUTPUT_DIR}/docs/$${subdir}; \
				mv $${REAL_OUTPUT_DIR}/src/$${subdir}.tmp/docs $${REAL_OUTPUT_DIR}/docs/$${subdir}/docs; \
				mv $${REAL_OUTPUT_DIR}/src/$${subdir}.tmp/README.md $${REAL_OUTPUT_DIR}/docs/$${subdir}/README.md; \
				rm -rf $${REAL_OUTPUT_DIR}/src/$${subdir}.tmp; \
			done \
		fi \
	fi

generate-ws-sdk:
	@if [ -z "${EXCHANGE}" -o -z "${LANGUAGE}" -o -z "${OUTPUT_DIR}" ]; then \
		echo "Usage: make generate-ws-sdk EXCHANGE=<exchange> LANGUAGE=<language> OUTPUT_DIR=<output_dir>"; \
		exit 1; \
	fi
	@if [ "${EXCHANGE}" == "binance" ]; then \
		if [ "${LANGUAGE}" == "go" ]; then \
			for file in $(shell find specs/${EXCHANGE}/asyncapi -name "*.yaml" -depth 1); do \
				echo "Generating ${EXCHANGE} go ws SDK for $$file"; \
				subdir=$$(echo "$$file" | sed -n 's|.*asyncapi/\(.*\)\.yaml|\1|p'); \
				rm -rf ${OUTPUT_DIR}/$$subdir; \
				(cd templates/${EXCHANGE}/asyncapi/${LANGUAGE} && \
				MODULE=$$subdir \
				OUTPUT_DIR=${OUTPUT_DIR}/$$subdir \
				ASYNCAPI_CLI=${ASYNCAPI_CLI:-asyncapi} \
				npm run generate:module); \
				echo "Post-processing integration tests for $$subdir"; \
				node templates/${EXCHANGE}/asyncapi/${LANGUAGE}/post-generate.js ${OUTPUT_DIR}/$$subdir; \
			done \
		fi \
	fi

release:
	@if [ -z "${EXCHANGE}" -o -z "${VERSION}" -o -z "${BASE_OUTPUT_DIR}" ]; then \
		echo "Usage: make release EXCHANGE=<exchange> VERSION=<version> BASE_OUTPUT_DIR=<base_output_dir>"; \
		exit 1; \
	fi
	@sed -i '' 's/version: .*/version: ${VERSION}/' configs/exchanges/${EXCHANGE}/rest.yaml
	@sed -i '' 's/packageVersion: .*/packageVersion: ${VERSION}/' generator-configs/${EXCHANGE}/openapi/go/*.yaml
	@sed -i '' 's/packageVersion: .*/packageVersion: ${VERSION}/' generator-configs/${EXCHANGE}/openapi/python/*.yaml
	@make generate-spec EXCHANGE=${EXCHANGE}

	@BASE_REAL_OUTPUT_DIR=${BASE_REAL_OUTPUT_DIR:-${BASE_OUTPUT_DIR}}
	make generate-sdk EXCHANGE=${EXCHANGE} LANGUAGE=go OUTPUT_DIR=${BASE_OUTPUT_DIR}/binance-go REAL_OUTPUT_DIR=${BASE_REAL_OUTPUT_DIR}/binance-go
	make generate-sdk EXCHANGE=${EXCHANGE} LANGUAGE=python OUTPUT_DIR=${BASE_OUTPUT_DIR}/binance-py REAL_OUTPUT_DIR=${BASE_REAL_OUTPUT_DIR}/binance-py
	@sed -i '' 's/^version = .*/version = "${VERSION}"/' ${BASE_REAL_OUTPUT_DIR}/binance-py/pyproject.toml
	make generate-sdk EXCHANGE=${EXCHANGE} LANGUAGE=rust OUTPUT_DIR=${BASE_OUTPUT_DIR}/binance-rs REAL_OUTPUT_DIR=${BASE_REAL_OUTPUT_DIR}/binance-rs
	@sed -i '' 's/^version = .*/version = "${VERSION}"/' ${BASE_REAL_OUTPUT_DIR}/binance-rs/Cargo.toml
	make generate-sdk EXCHANGE=${EXCHANGE} LANGUAGE=js OUTPUT_DIR=${BASE_OUTPUT_DIR}/binance-js REAL_OUTPUT_DIR=${BASE_REAL_OUTPUT_DIR}/binance-js
	@sed -i '' 's/"version": .*/"version": "${VERSION}",/' ${BASE_REAL_OUTPUT_DIR}/binance-js/package.json

clean:
	@rm -rf $(BIN_DIR)
	@rm -f coverage.out

format:
	@find . -name "*.go" -not -path "*/templates/*/tests/integration/*" -not -path "*/test/project/*" -exec gofmt -s -w {} +
	@cd . && GOPROXY=direct $(GOCMD) mod tidy -e

lint:
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run $$($(GOLIST)); \
	else \
		echo "golangci-lint is not installed. Please install it using:"; \
		echo "go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest"; \
		exit 1; \
	fi

vet:
	@$(GOVET) $$($(GOLIST))

test: unit-test

unit-test:
	@$(GOTEST) -v -race $$($(GOLIST))

test-with-samples:
	@TEST_WITH_SAMPLES=1 $(GOTEST) -v $$($(GOLIST))

coverage:
	@$(GOTEST) -coverprofile=coverage.out $$($(GOLIST))
	@$(GOCMD) tool cover -html=coverage.out

deps:
	@$(GOCMD) mod download
	@$(GOCMD) mod verify

help:
	@echo "Available targets:"
	@echo "  all              - Format, lint, vet, test, and build"
	@echo "  build            - Build the binary"
	@echo "  clean            - Clean build files"
	@echo "  format           - Format code and tidy modules"
	@echo "  lint             - Run golangci-lint"
	@echo "  vet              - Run go vet"
	@echo "  test             - Run all tests"
	@echo "  unit-test        - Run unit tests"
	@echo "  test-with-samples - Run tests with sample files"
	@echo "  coverage         - Generate test coverage report"
	@echo "  deps             - Download and verify dependencies"
	@echo "  help             - Show this help message"
