# K8s produção segura (implementado)

- Removido `k8s/secret.yaml` com placeholders; template em `k8s/secret.example.yaml`; `k8s/secret.yaml` no `.gitignore`.
- `k8s/external-secret.example.yaml` alinhado ao Secret `nf-processor-secrets` e a todas as chaves do template; `k8s/cluster-secret-store.example.yaml` (AWS SM exemplo).
- Ingress com TLS + `cert-manager.io/cluster-issuer`; `k8s/cluster-issuer.example.yaml` (staging + prod).
- `deployment.yaml`: `securityContext` pod/container, `readOnlyRootFilesystem`, `emptyDir` em `/tmp`, labels `app.kubernetes.io/*`.
- Guias: `docs/secrets-setup.md`, `docs/tls-setup.md`, `k8s/README.md` (inclui verificação staging).
