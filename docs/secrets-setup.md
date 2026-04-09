# External Secrets Operator — finance-consumer

This service expects a Kubernetes Secret named **`nf-processor-secrets`** in namespace **`nf-processor`** (see `k8s/deployment.yaml`). In production, that Secret should be created by **External Secrets Operator** (ESO), not committed to Git.

## Steps

1. Install [External Secrets Operator](https://external-secrets.io/latest/introduction/getting-started/) in the cluster.
2. Configure authentication to your secret backend (e.g. AWS Secrets Manager with IRSA on EKS). Edit and apply a store derived from [`k8s/cluster-secret-store.example.yaml`](../k8s/cluster-secret-store.example.yaml).
3. Create the remote secret(s) with the keys expected by the app (`DB_USERNAME`, `DB_PASSWORD`, `REDIS_PASSWORD`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `JWT_SECRET`), or adjust `remoteRef` in the ExternalSecret to match your layout.
4. Copy [`k8s/external-secret.example.yaml`](../k8s/external-secret.example.yaml) to a local file (e.g. `external-secret.yaml`), set `remoteRef.key` / `property` to match your backend, and `kubectl apply -f`.
5. Confirm the Secret exists: `kubectl get secret nf-processor-secrets -n nf-processor`.

`refreshInterval` in the example is `1h` for automatic rotation sync.

## Local development

Use [`k8s/secret.example.yaml`](../k8s/secret.example.yaml) → copy to `k8s/secret.yaml` (gitignored). See [`k8s/README.md`](../k8s/README.md).
