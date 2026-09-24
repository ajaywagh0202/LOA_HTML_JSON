# LOA layout compatibility

The sample `00934360101107_CR-DRMWBB-2023-33-09.html` contains description rows with four physical cells, including a cell spanning four columns. Previously these rows were discarded by a seven-cell minimum check.

The parser now expands colspan/rowspan, maps breakup fields by column labels, scopes rows to their own tables, and retains heading descriptions. It supports hidden JSON in named hidden inputs, textareas, and application/json script elements without executing scripts. Visible detail rows can be matched by awarded-item ID or schedule/item serial numbers. Hidden-only awarded items are retained, and missing visible details are merged per item rather than skipped for an entire schedule.

The existing normalized JSON fields remain. `json_data.source_tables` additionally retains text from unfamiliar table columns; `json_data.parse_warnings` identifies documents with no recognized schedules. Original uploaded HTML continues to be saved by the existing upload service. These additions do not imply that arbitrary HTML can be mapped automatically to the LOA schema.

## Validation

Run `node --test src/utils/loaParser.test.js` from `backend`.

Sample result: 11 schedules, 27 awarded items, 174 breakup rows (previously 118). The extra 56 rows are descriptions/headings. The contract value remains 172771492.17. Nine additional existing HTML files were compared against the original parser with no changes to LOA number, contract value, schedule count, awarded-item count, or quantity-bearing row count.

The new-record PostgreSQL insertion path was tested with a mocked client, including all 174 breakup rows. No live database was modified during validation.

## PostgreSQL follow-up requiring approval

The existing duplicate-LOA synchronization path only refreshes contract and schedule values. Re-uploading this already-stored LOA will update MongoDB JSON but will not backfill PostgreSQL awarded items or breakup descriptions.

Proposed follow-up: add `contracts.json_data` as JSONB to retain the same full parsed document as MongoDB; transactionally refresh existing schedules and awarded items by their existing IDs; match existing breakup rows within their schedule and awarded parent, update their parsed values, and insert missing rows. Preserve existing restriction selections and row identities. Do not delete unrelated rows. Validate duplicate matching and rollback with database fixtures before applying to live data.

Automatic approval review rejected the initial implementation of that follow-up because the schema changes and updates across existing rows could overwrite shared data. It has not been applied. Approve this database scope separately before implementation.
