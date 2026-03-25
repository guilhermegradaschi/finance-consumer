# DEPLOYMENT.md — Docker, Kubernetes, CI/CD e Estratégia de Deploy

## 1. Dockerfile (Produção — Multi-stage)

```dockerfile
# docker/Dockerfile

# ===== Stage 1: Builder =====
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar apenas package files primeiro (cache de dependências)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copiar source e buildar
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ src/
COPY migrations/ migrations/

RUN npm run build

# Remover devDependencies
RUN npm prune --production

# ===== Stage 2: Production =====
FROM node:20-alpine AS production

# Instalar dependências nativas necessárias para libxmljs2
RUN apk add --no-cache libxml2 libxslt

# Segurança: não rodar como root
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copiar artefatos do builder
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
COPY --from=builder --chown=appuser:appgroup /app/migrations ./migrations

# XSD files (se existirem)
COPY --from=builder --chown=appuser:appgroup /app/src/modules/xml-processor/xsd ./dist/modules/xml-processor/xsd

USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

## 2. Dockerfile (Desenvolvimento)

```dockerfile
# docker/Dockerfile.dev
FROM node:20-alpine

RUN apk add --no-cache libxml2 libxslt libxml2-dev libxslt-dev python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 3000
EXPOSE 9229

CMD ["npm", "run", "start:dev"]
```

## 3. Docker Compose (Desenvolvimento Local)

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  # ===== Aplicação =====
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile.dev
    ports:
      - "3000:3000"
      - "9229:9229"  # Debug
    volumes:
      - ../src:/app/src
      - ../migrations:/app/migrations
      - ../test:/app/test
    env_file:
      - ../.env.development
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
      minio:
        condition: service_started
    networks:
      - nf-network

  # ===== PostgreSQL =====
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: nf_processor
      POSTGRES_USER: nf_user
      POSTGRES_PASSWORD: nf_password
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nf_user -d nf_processor"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - nf-network

  # ===== Redis =====
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - nf-network

  # ===== RabbitMQ =====
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"  # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: nf_user
      RABBITMQ_DEFAULT_PASS: nf_password
      RABBITMQ_DEFAULT_VHOST: nf_processor
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "check_running"]
      interval: 10s
      timeout: 10s
      retries: 5
    networks:
      - nf-network

  # ===== MinIO (S3 local) =====
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"  # Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    networks:
      - nf-network

  # ===== Criar bucket padrão no MinIO =====
  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
        sleep 5;
        mc alias set myminio http://minio:9000 minioadmin minioadmin;
        mc mb myminio/nf-processor-xmls --ignore-existing;
        mc anonymous set download myminio/nf-processor-xmls;
        exit 0;
      "
    networks:
      - nf-network

  # ===== SigNoz (Observabilidade) =====
  signoz:
    image: signoz/signoz-otel-collector:latest
    ports:
      - "4317:4317"  # gRPC
      - "4318:4318"  # HTTP
    networks:
      - nf-network

volumes:
  pg_data:
  redis_data:
  rabbitmq_data:
  minio_data:

networks:
  nf-network:
    driver: bridge
```

---

## 4. Kubernetes Manifests

### 4.1 Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nf-processor
  labels:
    app: nf-processor
```

### 4.2 ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nf-processor-config
  namespace: nf-processor
data:
  NODE_ENV: "production"
  PORT: "3000"
  DB_HOST: "postgres-service.nf-processor.svc.cluster.local"
  DB_PORT: "5432"
  DB_DATABASE: "nf_processor"
  DB_POOL_SIZE: "20"
  DB_SSL: "true"
  REDIS_HOST: "redis-service.nf-processor.svc.cluster.local"
  REDIS_PORT: "6379"
  REDIS_DB: "0"
  REDIS_KEY_PREFIX: "nf:"
  RABBITMQ_URL: "amqp://nf_user:RABBITMQ_PASS@rabbitmq-service.nf-processor.svc.cluster.local:5672/nf_processor"
  AWS_REGION: "us-east-1"
  S3_BUCKET: "nf-processor-xmls-prod"
  SIGNOZ_ENDPOINT: "http://signoz-otel-collector.observability.svc.cluster.local:4318"
  LOG_LEVEL: "info"
  RECEITA_WS_URL: "https://receitaws.com.br/v1"
  RECEITA_WS_TIMEOUT_MS: "10000"
  SEFAZ_TIMEOUT_MS: "10000"
```

### 4.3 Secret

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: nf-processor-secrets
  namespace: nf-processor
type: Opaque
stringData:
  DB_USERNAME: "nf_user"
  DB_PASSWORD: "CHANGE_ME_IN_PRODUCTION"
  REDIS_PASSWORD: "CHANGE_ME_IN_PRODUCTION"
  JWT_SECRET: "CHANGE_ME_IN_PRODUCTION_MINIMUM_32_CHARS"
  SEFAZ_API_URL: "https://sefaz-api.example.com"
  SEFAZ_API_TOKEN: "CHANGE_ME"
  AWS_ACCESS_KEY_ID: "CHANGE_ME"
  AWS_SECRET_ACCESS_KEY: "CHANGE_ME"
```

### 4.4 Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nf-processor
  namespace: nf-processor
  labels:
    app: nf-processor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nf-processor
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: nf-processor
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: nf-processor
          image: your-registry.com/nf-processor:latest
          ports:
            - containerPort: 3000
              name: http
          envFrom:
            - configMapRef:
                name: nf-processor-config
            - secretRef:
                name: nf-processor-secrets
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 15
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 30
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 12
          lifecycle:
            preStop:
              exec:
                command: ["sh", "-c", "sleep 10"]
```

### 4.5 Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: nf-processor-service
  namespace: nf-processor
spec:
  type: ClusterIP
  selector:
    app: nf-processor
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
      name: http
```

### 4.6 HPA

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nf-processor-hpa
  namespace: nf-processor
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nf-processor
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
```

### 4.7 Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nf-processor-ingress
  namespace: nf-processor
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - nf-api.yourdomain.com
      secretName: nf-processor-tls
  rules:
    - host: nf-api.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nf-processor-service
                port:
                  number: 80
```

---

## 5. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci-cd.yml
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
  # ===== Lint & Test =====
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: nf_processor_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_pass
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm run test:cov

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  # ===== Build & Push Docker =====
  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ===== Deploy to Production =====
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG }}

      - name: Update image tag
        run: |
          kubectl set image deployment/nf-processor \
            nf-processor=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -n nf-processor

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/nf-processor -n nf-processor --timeout=300s

      - name: Run migrations
        run: |
          kubectl exec deployment/nf-processor -n nf-processor -- \
            npx typeorm migration:run -d dist/infrastructure/database/typeorm.config.js
```

---

## 6. Estratégia de Deploy

### Rolling Update (padrão)

- `maxSurge: 1` — cria 1 pod novo antes de remover antigo.
- `maxUnavailable: 0` — zero downtime.
- `terminationGracePeriodSeconds: 60` — 60s para finalizar mensagens em processamento.
- `preStop` hook com `sleep 10` para permitir que o load balancer remova o pod antes do SIGTERM.

### Rollback

```bash
# Verificar histórico de deploys
kubectl rollout history deployment/nf-processor -n nf-processor

# Rollback para revisão anterior
kubectl rollout undo deployment/nf-processor -n nf-processor

# Rollback para revisão específica
kubectl rollout undo deployment/nf-processor -n nf-processor --to-revision=3
```

---

## 7. Health Checks

| Endpoint       | Tipo      | Propósito                                  | Intervalo |
|----------------|-----------|---------------------------------------------|-----------|
| /health/live   | Liveness  | Processo está vivo?                         | 15s       |
| /health/ready  | Readiness | Pode receber tráfego? (DB, Redis, RMQ ok?) | 10s       |
| /health        | Full      | Diagnóstico completo com status de cada dep | Manual    |
