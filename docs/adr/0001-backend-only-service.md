# ADR 0001: finance-consumer is backend-only

## Status

Accepted

## Context

The repository implements an NF-e processing pipeline (HTTP API + RabbitMQ consumers) without a first-party web UI.

## Decision

The service is **backend-only**. No frontend application will live in this repository. API consumers are other systems (BFFs, internal tools, partners).

## Consequences

- Documentation and operational focus remain on APIs, queues, and observability endpoints (`/health`).
- Authentication is JWT-based for API access; there is no session/cookie-oriented SPA in this repo.
