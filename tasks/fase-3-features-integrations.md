# Fase 3 — Features & Integrations (implementado)

Resumo do que foi entregue neste repositório:

- **SEFAZ:** `SefazClient` com modo mock (default) e modo SOAP real (HTTPS + certificado PKCS#12), `SEFAZ_MOCK_ENABLED` com fail-fast em produção via Joi, fallback do circuit breaker com `valid: false`, utilitário SOAP e testes unitários; integração real depende de URL WSDL/ambiente corretos e homologação.
- **XSD:** `NfeXsdValidationService` com `libxmljs2` antes do parse quando `NFE_XSD_BASE_PATH` + arquivo principal existem; README em `schemas/nfe/`; limite de body XML via `MAX_XML_BODY_BYTES`.
- **API:** rate limit por usuário (Redis sliding window) em rotas NF; audit log estruturado nos use cases; camada `application/use-cases` + snapshot de domínio em `src/domain`.
- **Auth / Fase 0 em paralelo:** JWT via `passport-jwt` (HS256, issuer/audience opcionais), blacklist Redis, `POST /api/v1/auth/revoke`, CORS restritivo em produção (`CORS_ORIGINS`), Helmet, validação Joi reforçada (JWT produção, DB password, SEFAZ/CORS).
- **Infra doc:** exemplo `k8s/external-secret.example.yaml`; ADRs `docs/adr/0001-backend-only-service.md` e `0002-email-s3-stubs.md`.
