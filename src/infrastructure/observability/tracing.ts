import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | undefined;

export function initTracing(): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (process.env.OTEL_SDK_DISABLED === 'true') {
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? process.env.APP_NAME ?? 'finance-consumer';

  sdk = new NodeSDK({
    resource: Resource.default().merge(
      new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
      }),
    ),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return;
  }
  await sdk.shutdown();
  sdk = undefined;
}
