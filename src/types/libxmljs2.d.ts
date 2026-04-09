declare module 'libxmljs2' {
  export interface Document {
    validate(doc: Document): boolean;
    readonly validationErrors: ReadonlyArray<{ message: string }>;
  }

  export function parseXml(xml: string, options?: Record<string, unknown>): Document;
}
