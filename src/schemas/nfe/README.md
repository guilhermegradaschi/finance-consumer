# NF-e 4.0 XSD schemas

Place official XSD files from the [Portal Nacional da NF-e](http://www.nfe.fazenda.gov.br/) in this directory (or a path referenced by env).

## Environment variables

- `NFE_XSD_BASE_PATH` — absolute or relative path to the folder containing the main schema file (e.g. this `src/schemas/nfe` directory after you add the files).
- `NFE_XSD_MAIN_FILE` — entry XSD filename (default: `leiauteNFe_v4.00.xsd`). The file must resolve all `xs:include` / imports (usually the full schema bundle from the national layout package).

If `NFE_XSD_BASE_PATH` is unset, the application skips XSD validation and only performs structural XML parsing in the pipeline.
