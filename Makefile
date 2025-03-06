.PHONY: all build clean format lint vet test unit-test coverage help

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOVET=$(GOCMD) vet
BINARY_NAME=openxapi

all: format lint vet test build

build:
	$(GOBUILD) -o $(BINARY_NAME) -v ./...

clean:
	rm -f $(BINARY_NAME)
	rm -f coverage.out

format:
	gofmt -s -w .
	$(GOCMD) mod tidy

lint:
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run ./...; \
	else \
		echo "golangci-lint is not installed. Please install it using:"; \
		echo "go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest"; \
		exit 1; \
	fi

vet:
	$(GOVET) ./...

test: unit-test

unit-test:
	$(GOTEST) -v -race ./...

coverage:
	$(GOTEST) -coverprofile=coverage.out ./...
	$(GOCMD) tool cover -html=coverage.out

deps:
	$(GOCMD) mod download
	$(GOCMD) mod verify

help:
	@echo "Available targets:"
	@echo "  all        - Format, lint, vet, test, and build"
	@echo "  build      - Build the binary"
	@echo "  clean      - Clean build files"
	@echo "  format     - Format code and tidy modules"
	@echo "  lint       - Run golangci-lint"
	@echo "  vet        - Run go vet"
	@echo "  test       - Run all tests"
	@echo "  unit-test  - Run unit tests"
	@echo "  coverage   - Generate test coverage report"
	@echo "  deps       - Download and verify dependencies"
	@echo "  help       - Show this help message" 