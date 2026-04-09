# ADR 0002: Email consumer and S3 listener stubs

## Status

Accepted

## Context

Optional ingestion paths (`IMAP_ENABLED`, `SQS_ENABLED`) were planned for NF-e XML. Implementations were deferred; polling and SQS handling are stubs.

## Decision

- **Default:** `IMAP_ENABLED=false` and `SQS_ENABLED=false`. The application starts normally; email and S3-listener code paths do not throw on startup.
- **Email:** When enabled, the service polls on an interval but does not fetch IMAP attachments (returns empty until a real implementation exists).
- **S3/SQS:** When enabled, long polling is not implemented; `processS3Event` remains available for programmatic or future trigger use.

## Consequences

- No accidental crash from enabling flags with empty implementations.
- Dependencies (`imap`, `mailparser`, `@aws-sdk/client-sqs`) may remain until features are implemented or explicitly removed in a follow-up change.
