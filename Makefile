.PHONY: all build clean format lint vet test unit-test coverage help test-with-samples generate-spec generate-sdk

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOVET=$(GOCMD) vet
BIN_DIR=bin
BINARY_NAME=$(BIN_DIR)/openxapi


all: format lint vet test build

build:
	@$(GOBUILD) -o $(BINARY_NAME) -v ./cmd/openxapi

generate-spec:
	@make build
	@if [ -n "${EXCHANGE}" ]; then \
		$(BINARY_NAME) -exchange ${EXCHANGE} -use-samples; \
	else \
		$(BINARY_NAME) -use-samples; \
	fi

generate-sdk:
	@if [ -z "${OPENAPI_GENERATOR_CLI}" ]; then \
		OPENAPI_GENERATOR_CLI=openapi-generator-cli; \
	fi
	@if [ "${LANGUAGE}" == "typescript" ]; then \
		for file in $(shell find generator-configs/${EXCHANGE}/openapi/typescript -name "*.yaml"); do \
			echo "Generating ${EXCHANGE} typescript SDK for $$file"; \
			subdir=$$(echo "$$file" | sed -n 's|.*typescript/\(.*\)\.yaml|\1|p'); \
			$(OPENAPI_GENERATOR_CLI) generate -c $$file -g typescript-axios -o ${OUTPUT_DIR}/src/$$subdir; \
		done \
	elif [ "${LANGUAGE}" == "go" ]; then \
		for file in $(shell find generator-configs/${EXCHANGE}/openapi/go -name "*.yaml"); do \
			echo "Generating ${EXCHANGE} go SDK for $$subdir"; \
			subdir=$$(echo "$$file" | sed -n 's|.*go/\(.*\)\.yaml|\1|p'); \
			$(OPENAPI_GENERATOR_CLI) generate -c $$file -g go -o ${OUTPUT_DIR}/$$subdir; \
		done \
	elif [ "${LANGUAGE}" == "python" ]; then \
		for file in $(shell find generator-configs/${EXCHANGE}/openapi/python -name "*.yaml"); do \
			echo "Generating ${EXCHANGE} python SDK for $$file"; \
			$(OPENAPI_GENERATOR_CLI) generate -c $$file -g python -o ${OUTPUT_DIR}; \
		done \
	fi

clean:
	@rm -rf $(BIN_DIR)
	@rm -f coverage.out

format:
	@gofmt -s -w .
	@$(GOCMD) mod tidy

lint:
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run ./...; \
	else \
		echo "golangci-lint is not installed. Please install it using:"; \
		echo "go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest"; \
		exit 1; \
	fi

vet:
	@$(GOVET) ./...

test: unit-test

unit-test:
	@$(GOTEST) -v -race ./...

test-with-samples:
	@TEST_WITH_SAMPLES=1 $(GOTEST) -v ./...

coverage:
	@$(GOTEST) -coverprofile=coverage.out ./...
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
