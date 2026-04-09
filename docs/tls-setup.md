# TLS for finance-consumer (Kubernetes Ingress)

The Ingress in [`k8s/ingress.yaml`](../k8s/ingress.yaml) is configured for **TLS** and **cert-manager**: HTTP → HTTPS redirect, a `tls` block, and annotation `cert-manager.io/cluster-issuer`.

## Steps

1. Install [cert-manager](https://cert-manager.io/docs/installation/) in the cluster.
2. Ensure your **Ingress controller** (e.g. nginx) is installed and matches `ingressClassName: nginx`.
3. Create a **ClusterIssuer** — edit email, solver, and class in [`k8s/cluster-issuer.example.yaml`](../k8s/cluster-issuer.example.yaml), then apply. Start with **Let's Encrypt staging** to avoid rate limits while testing.
4. Set the Ingress annotation to the issuer you created, for example:
   - `cert-manager.io/cluster-issuer: letsencrypt-staging` (testing)
   - `cert-manager.io/cluster-issuer: letsencrypt-prod` (production)
5. Set `spec.rules[].host` and `spec.tls[].hosts` to your real DNS name pointing at the Ingress controller.
6. After the Certificate is ready, cert-manager will populate the TLS Secret (`nf-processor-tls` in the example).

## References

- [cert-manager Ingress documentation](https://cert-manager.io/docs/usage/ingress/)
- Deploy order and smoke checks: [`k8s/README.md`](../k8s/README.md)
