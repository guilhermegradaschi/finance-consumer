# Kubernetes manifests (nf-processor)

## Secrets policy

- **Production:** use [External Secrets Operator](https://external-secrets.io/) — see [docs/secrets-setup.md](../docs/secrets-setup.md) and `external-secret.example.yaml`. The in-cluster Secret name must be `nf-processor-secrets` (referenced by `deployment.yaml`).
- **Local / ad-hoc:** copy `secret.example.yaml` to `secret.yaml` (gitignored), fill `stringData`, apply once. Do not commit `secret.yaml`.

## TLS

- Ingress expects **cert-manager** and a **ClusterIssuer**; see [docs/tls-setup.md](../docs/tls-setup.md) and `cluster-issuer.example.yaml`.
- Prefer `letsencrypt-staging` on the Ingress annotation until certificates issue successfully, then switch to `letsencrypt-prod`.

## Apply order (typical)

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
# Secrets: either ESO-generated Secret, or local:
#   cp k8s/secret.example.yaml k8s/secret.yaml && edit && kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml
kubectl apply -f k8s/ingress.yaml
```

With ESO, apply `ClusterSecretStore` and `ExternalSecret` **before** or **restart deployment after** the Secret `nf-processor-secrets` exists.

## Staging verification (definition of done)

Replace host/port with your Service or Ingress URL.

1. Pods ready: `kubectl get pods -n nf-processor`
2. Secret present (no placeholder deploy): `kubectl get secret nf-processor-secrets -n nf-processor`
3. Liveness: `curl -sSf "http://<svc-or-ingress>/health/live"`
4. Readiness: `curl -sSf "http://<svc-or-ingress>/health/ready"` (503 if a dependency is down)
5. Metrics: `curl -sSf "http://<svc-or-ingress>/metrics" | head`
6. TLS (if using Ingress): `curl -sSf "https://<host>/health/live"`

## Example files (copy and customize)

| File | Purpose |
|------|---------|
| `cluster-secret-store.example.yaml` | ClusterSecretStore for ESO |
| `external-secret.example.yaml` | ExternalSecret → `nf-processor-secrets` |
| `cluster-issuer.example.yaml` | Let's Encrypt issuers for cert-manager |
| `secret.example.yaml` | Local Secret template |
