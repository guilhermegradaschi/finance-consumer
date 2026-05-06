# 03 - Auditoria de Infraestrutura

## Visão Geral

Este documento analisa a infraestrutura do finance-consumer: build, deploy, containers, CI/CD, observabilidade e riscos operacionais.

---

## Stack de Infraestrutura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            INFRAESTRUTURA                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   GitHub    │───▶│   Actions   │───▶│    GHCR     │───▶│ Kubernetes  │  │
│  │    Repo     │    │    CI/CD    │    │   Registry  │    │   Cluster   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         KUBERNETES CLUSTER                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │ Ingress  │  │ Service  │  │ Deployment│  │   HPA    │            │   │
│  │  │ (nginx)  │  │(ClusterIP)│  │ (3 pods) │  │ (2-10)   │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  │                                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │   │
│  │  │ConfigMap │  │  Secret  │  │Namespace │                          │   │
│  │  │  (env)   │  │ (creds)  │  │(finance) │                          │   │
│  │  └──────────┘  └──────────┘  └──────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      EXTERNAL DEPENDENCIES                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │PostgreSQL│  │ RabbitMQ │  │  Redis   │  │ S3/MinIO │            │   │
│  │  │   16     │  │  3.13    │  │    7     │  │          │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## CI/CD Pipeline

### GitHub Actions Workflow Atual

**Localização**: `.github/workflows/ci.yml`

```yaml
# Estrutura atual do pipeline
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run test:cov

  build-docker:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

### Problemas Identificados no CI/CD

| # | Problema | Impacto | Severidade |
|---|----------|---------|------------|
| 1 | Falta job de security scan (SAST/DAST) | Vulnerabilidades não detectadas | 🔴 Alto |
| 2 | Falta lint de Dockerfile | Best practices não validadas | 🟡 Médio |
| 3 | Falta scan de dependências (pnpm audit) | CVEs em deps | 🔴 Alto |
| 4 | Falta teste de integração com RabbitMQ | Regressões em messaging | 🟠 Alto |
| 5 | Falta step de deploy automático | Deploy manual propenso a erro | 🟡 Médio |
| 6 | Secrets sem rotação automática | Credential exposure | 🟠 Alto |
| 7 | Falta cache de Docker layers | Builds lentos | 🟢 Baixo |

### CI/CD Pipeline Proposto

```yaml
# .github/workflows/ci-improved.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ============================================
  # STAGE 1: CODE QUALITY
  # ============================================
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run format:check

  # ============================================
  # STAGE 2: SECURITY SCANNING
  # ============================================
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run pnpm audit
        run: pnpm audit --audit-level=high
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'HIGH,CRITICAL'
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  # ============================================
  # STAGE 3: UNIT TESTS
  # ============================================
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test:cov
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  # ============================================
  # STAGE 4: INTEGRATION TESTS
  # ============================================
  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: nf_processor_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      rabbitmq:
        image: rabbitmq:3.13-management
        env:
          RABBITMQ_DEFAULT_USER: test
          RABBITMQ_DEFAULT_PASS: test
        options: >-
          --health-cmd "rabbitmq-diagnostics -q ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test:integration
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          RABBITMQ_HOST: localhost
          RABBITMQ_PORT: 5672

  # ============================================
  # STAGE 5: BUILD & PUSH
  # ============================================
  build:
    needs: [lint, security, test-unit, test-integration]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}
      
      - name: Lint Dockerfile
        uses: hadolint/hadolint-action@v3.1.0
        with:
          dockerfile: Dockerfile
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Scan Docker image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          severity: 'HIGH,CRITICAL'

  # ============================================
  # STAGE 6: DEPLOY (GitOps trigger)
  # ============================================
  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - name: Trigger ArgoCD sync
        run: |
          curl -X POST ${{ secrets.ARGOCD_WEBHOOK_URL }} \
            -H "Authorization: Bearer ${{ secrets.ARGOCD_TOKEN }}" \
            -d '{"image": "${{ needs.build.outputs.image-tag }}"}'

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Trigger ArgoCD sync
        run: |
          curl -X POST ${{ secrets.ARGOCD_WEBHOOK_URL }} \
            -H "Authorization: Bearer ${{ secrets.ARGOCD_TOKEN }}" \
            -d '{"image": "${{ needs.build.outputs.image-tag }}"}'
```

---

## Dockerfile

### Dockerfile Atual (Problemas)

```dockerfile
# ❌ Problemas identificados
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN pnpm install  # Sem lockfile rígido (preferir pnpm install --frozen-lockfile em CI/Docker)

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

| # | Problema | Impacto |
|---|----------|---------|
| 1 | `node:20` sem tag específica | Builds não reproduzíveis |
| 2 | Root user | Vulnerabilidade de segurança |
| 3 | `pnpm install` sem `--frozen-lockfile` em imagens/CI | Deps não determinísticas |
| 4 | Single-stage build | Imagem grande (~1GB) |
| 5 | Sem healthcheck | Container sem self-check |
| 6 | Copia tudo (inclui .git, node_modules dev) | Imagem inflada |

### Dockerfile Proposto

```dockerfile
# ============================================
# STAGE 1: Build
# ============================================
FROM node:20.10-alpine3.18 AS builder

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

# Copy package files first (layer caching)
COPY --chown=nestjs:nodejs package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY --chown=nestjs:nodejs . .

# Build application
RUN pnpm run build

# Prune dev dependencies
RUN pnpm prune --prod

# ============================================
# STAGE 2: Production
# ============================================
FROM node:20.10-alpine3.18 AS production

# Security hardening
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs && \
    apk add --no-cache dumb-init

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

# Security: drop capabilities
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

# Labels
LABEL org.opencontainers.image.source="https://github.com/org/finance-consumer"
LABEL org.opencontainers.image.description="NF-e Processor Service"
LABEL org.opencontainers.image.licenses="MIT"
```

### .dockerignore

```
# .dockerignore
.git
.github
.vscode
.idea
*.md
!README.md
node_modules
dist
coverage
.env*
!.env.example
docker-compose*.yml
Dockerfile*
.dockerignore
*.log
.nyc_output
.jest
```

---

## Kubernetes Manifests

### Problemas nos Manifests Atuais

**Localização**: `k8s/`

| Arquivo | Problema | Severidade |
|---------|----------|------------|
| `secret.yaml` | Valores `REPLACE_ME` hardcoded | 🔴 Crítico |
| `deployment.yaml` | Falta PodDisruptionBudget | 🟠 Alto |
| `deployment.yaml` | Falta resource limits | 🟠 Alto |
| `deployment.yaml` | Falta securityContext | 🟠 Alto |
| `deployment.yaml` | Falta topologySpreadConstraints | 🟡 Médio |
| `hpa.yaml` | Só escala por CPU, falta memory/custom | 🟡 Médio |
| `ingress.yaml` | Falta TLS config | 🔴 Crítico |
| Todos | Falta labels padronizados | 🟢 Baixo |

### Secret - CRÍTICO

```yaml
# ❌ Atual - k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: finance-consumer-secrets
type: Opaque
data:
  DB_PASSWORD: UkVQTEFDRV9NRQ==      # "REPLACE_ME" em base64!
  RABBITMQ_PASSWORD: UkVQTEFDRV9NRQ== # "REPLACE_ME"!
  JWT_SECRET: UkVQTEFDRV9NRQ==        # "REPLACE_ME"!
```

```yaml
# ✅ Proposto - External Secrets Operator
# k8s/external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: finance-consumer-secrets
  namespace: finance
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: aws-secrets-manager  # ou vault, gcp, azure
  target:
    name: finance-consumer-secrets
    creationPolicy: Owner
  data:
    - secretKey: DB_PASSWORD
      remoteRef:
        key: finance-consumer/database
        property: password
    - secretKey: RABBITMQ_PASSWORD
      remoteRef:
        key: finance-consumer/rabbitmq
        property: password
    - secretKey: JWT_SECRET
      remoteRef:
        key: finance-consumer/auth
        property: jwt_secret
```

### Deployment Completo

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: finance-consumer
  namespace: finance
  labels:
    app.kubernetes.io/name: finance-consumer
    app.kubernetes.io/component: api
    app.kubernetes.io/part-of: nfe-platform
    app.kubernetes.io/version: "1.0.0"
spec:
  replicas: 3
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app.kubernetes.io/name: finance-consumer
  template:
    metadata:
      labels:
        app.kubernetes.io/name: finance-consumer
    spec:
      serviceAccountName: finance-consumer
      
      # Security context
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault
      
      # Spread across zones
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: finance-consumer
      
      # Anti-affinity for HA
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app.kubernetes.io/name: finance-consumer
                topologyKey: kubernetes.io/hostname
      
      containers:
        - name: finance-consumer
          image: ghcr.io/org/finance-consumer:latest
          imagePullPolicy: Always
          
          # Security
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          
          # Ports
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          
          # Resources
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          
          # Environment
          envFrom:
            - configMapRef:
                name: finance-consumer-config
            - secretRef:
                name: finance-consumer-secrets
          
          # Probes
          startupProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 30
          
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 0
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 0
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          
          # Volumes
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      
      volumes:
        - name: tmp
          emptyDir: {}
      
      terminationGracePeriodSeconds: 30
```

### PodDisruptionBudget

```yaml
# k8s/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: finance-consumer-pdb
  namespace: finance
spec:
  minAvailable: 2  # Garante 2 pods durante manutenção
  selector:
    matchLabels:
      app.kubernetes.io/name: finance-consumer
```

### HPA Melhorado

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: finance-consumer-hpa
  namespace: finance
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: finance-consumer
  minReplicas: 2
  maxReplicas: 10
  metrics:
    # CPU
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    # Memory
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: External
      external:
        metric:
          name: rabbitmq_queue_messages
          selector:
            matchLabels:
              queue: nf.received
        target:
          type: AverageValue
          averageValue: "100"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

### Ingress com TLS

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: finance-consumer-ingress
  namespace: finance
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
    - hosts:
        - nfe-api.empresa.com.br
      secretName: finance-consumer-tls
  rules:
    - host: nfe-api.empresa.com.br
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: finance-consumer
                port:
                  number: 3000
```

---

## Observabilidade

### Estado Atual

| Componente | Status | Problema |
|------------|--------|----------|
| Logs | ⚠️ Parcial | JSON, mas sem correlation ID consistente |
| Métricas | ❌ Ausente | In-memory, não exportadas |
| Traces | ❌ Ausente | Não implementado |
| Alerts | ❌ Ausente | Não configurados |
| Dashboards | ❌ Ausente | Não existem |

### Arquitetura de Observabilidade Proposta

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OBSERVABILITY STACK                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │   finance   │───▶│   OTEL      │───▶│   Tempo     │                     │
│  │  consumer   │    │  Collector  │    │  (Traces)   │                     │
│  │             │    │             │    └─────────────┘                     │
│  │  stdout     │───▶│             │───▶│    Loki     │                    │
│  └─────────────┘    └─────────────┘    │   (Logs)    │                    │
│                                        └─────────────┘                     │
│                                                                             │
│                     ┌─────────────┐                                         │
│                     │ AlertManager│───▶ PagerDuty / Slack / Email          │
│                     └─────────────┘                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementação de Tracing (OpenTelemetry)

```typescript
// src/infrastructure/observability/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initTracing() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'finance-consumer',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  
  sdk.start();
  
  process.on('SIGTERM', () => {
    sdk.shutdown().then(() => process.exit(0));
  });
}

// main.ts
import { initTracing } from './infrastructure/observability/tracing';

// Inicializar ANTES de qualquer import
initTracing();

// ... resto do bootstrap
```

---

## Variáveis de Ambiente

### Análise do .env.example

| Variável | Valor Atual | Problema | Correção |
|----------|-------------|----------|----------|
| `JWT_SECRET` | `dev-secret-key-change-in-production` | Valor default inseguro | Remover default, validar em runtime |
| `DB_PASSWORD` | `nf_password` | Senha fraca em exemplo | Colocar placeholder `CHANGE_ME` |
| `DB_POOL_SIZE` | `20` | Pode ser alto para pods pequenos | Calcular baseado em resources |
| `THROTTLE_LIMIT` | `100` | Global, não por user | Adicionar `THROTTLE_LIMIT_PER_USER` |

### Validação de Configuração

```typescript
// src/config/env.validation.ts
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Node
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .required(),
  PORT: Joi.number().default(3000),
  
  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string()
    .min(16)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .required()
    .messages({
      'string.min': 'DB_PASSWORD must be at least 16 characters',
      'string.pattern.base': 'DB_PASSWORD must contain uppercase, lowercase, number, and special character',
    }),
  DB_DATABASE: Joi.string().required(),
  DB_POOL_SIZE: Joi.number().min(5).max(50).default(20),
  
  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  
  // RabbitMQ
  RABBITMQ_HOST: Joi.string().required(),
  RABBITMQ_PORT: Joi.number().default(5672),
  RABBITMQ_USERNAME: Joi.string().required(),
  RABBITMQ_PASSWORD: Joi.string().required(),
  RABBITMQ_VHOST: Joi.string().default('/'),
  RABBITMQ_PREFETCH: Joi.number().min(1).max(100).default(10),
  
  // JWT - CRÍTICO
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .custom((value, helpers) => {
      if (value.includes('dev') || value.includes('secret') || value.includes('change')) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'any.invalid': 'JWT_SECRET appears to be a placeholder. Use a secure random string.',
      'string.min': 'JWT_SECRET must be at least 32 characters',
    }),
  JWT_EXPIRATION: Joi.string().default('1h'),
  
  // S3
  S3_ENDPOINT: Joi.string().uri().required(),
  S3_BUCKET: Joi.string().required(),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  
  // Feature flags
  IMAP_ENABLED: Joi.boolean().default(false),
  SQS_ENABLED: Joi.boolean().default(false),
});

// src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
  ],
})
export class AppModule {}
```

---

## Riscos Operacionais

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|---------------|---------|-----------|
| 1 | Deploy com secrets placeholder | Alta | Crítico | External Secrets + validação CI |
| 2 | OOM em XMLs grandes | Média | Alto | Streaming parser + limits |
| 3 | Connection pool exhaustion | Média | Alto | Proper sizing + monitoring |
| 4 | Cascading failure em deps | Média | Alto | Circuit breakers + bulkheads |
| 5 | Zero observability | Alta | Alto | Implementar stack OTEL |
| 6 | Rollback sem PDB | Média | Médio | Adicionar PodDisruptionBudget |
| 7 | TLS não configurado | Alta | Crítico | Cert-manager + Ingress TLS |
| 8 | Logs sem estrutura | Média | Médio | Structured logging (JSON) |

---

## Checklist de Infraestrutura

### Pré-Produção Obrigatório

- [ ] Secrets em Secret Manager (não em repo)
- [ ] TLS configurado em Ingress
- [ ] Health checks verificando dependências
- [ ] Resource limits em todos containers
- [ ] PodDisruptionBudget configurado
- [ ] Logs estruturados para Loki/ELK
- [ ] Alertas básicos configurados
- [ ] Runbook de incidentes documentado

### Pós-Produção Recomendado

- [ ] Tracing distribuído (OTEL)
- [ ] SLOs/SLIs definidos
- [ ] Chaos engineering (Litmus)
- [ ] Load testing automatizado
- [ ] Disaster recovery testado
