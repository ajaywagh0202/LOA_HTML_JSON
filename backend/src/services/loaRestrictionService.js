import { postgresPool } from '../config/postgres.js';
import LoaLetter from '../models/LoaLetter.js';
import { applyRestrictionJson } from './loaRestrictionJson.js';

export const restrictionTables = ['contract_schedules', 'awarded_items', 'item_breakups'];
export const isRestricted = (value) => ['Y', 'YES'].includes(String(value ?? '').trim().toUpperCase());
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const overallRestriction = (record) => record.whether_loa_restricted ?? record.get?.('loa_restricted') ?? record.loa_restricted ?? record.json_data?.whether_loa_restricted;

// Stable keys distinguish even breakup rows with identical item codes/descriptions.
export const ensureRestrictionColumns = async (client) => {
  for (const table of restrictionTables) {
    await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS restriction_row_id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)`);
    await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS whether_loa_restricted VARCHAR(1) NOT NULL DEFAULT 'N'`);
  }
};

export const validateRestrictionRows = (submitted, current, restricted) => {
  const result = {};
  for (const table of restrictionTables) {
    const rows = submitted?.[table];
    if (!Array.isArray(rows) || rows.length !== current[table].length) {
      throw fail('The LOA rows have changed. Reload the details before updating.', 409);
    }
    const allowed = new Set(current[table].map((row) => row.restriction_row_id));
    result[table] = rows.map((row) => {
      if (!row || !allowed.delete(row.restriction_row_id) || !['Y', 'N'].includes(row.whether_loa_restricted)) {
        throw fail('Invalid or duplicate restriction row. Reload the details and try again.');
      }
      if (!restricted && row.whether_loa_restricted === 'Y') throw fail('This LOA is not restricted.');
      return { restriction_row_id: row.restriction_row_id, whether_loa_restricted: row.whether_loa_restricted };
    });
  }
  return result;
};

const readRows = async (client, loaNo, lock = false) => {
  const result = {};
  for (const table of restrictionTables) {
    const { rows } = await client.query(`SELECT * FROM public.${table} WHERE loa_no = $1 ORDER BY schedule_id, item_sno, restriction_row_id${lock ? ' FOR UPDATE' : ''}`, [loaNo]);
    result[table] = rows.map((row) => ({ ...row, whether_loa_restricted: isRestricted(row.whether_loa_restricted) ? 'Y' : 'N' }));
  }
  return result;
};

export const getRestrictionDetails = async (record) => {
  const client = await postgresPool.connect();
  try {
    await ensureRestrictionColumns(client);
    const contract = await client.query('SELECT * FROM public.contracts WHERE loa_no = $1 LIMIT 1', [record.loa_no]);
    if (!contract.rows.length) throw fail('The LOA is not available in PostgreSQL. Retry the upload before editing restrictions.', 409);
    const rows = await readRows(client, record.loa_no);
    // MongoDB retains a pending selection if the previous PostgreSQL commit failed.
    for (const table of restrictionTables) {
      const saved = new Map((record.json_data?.[table] || record[table] || []).map((row) => [row.restriction_row_id, row.whether_loa_restricted]));
      rows[table] = rows[table].map((row) => ({ ...row, whether_loa_restricted: isRestricted(overallRestriction(record)) ? (saved.get(row.restriction_row_id) ?? row.whether_loa_restricted) : 'N' }));
    }
    return { contract: contract.rows[0], ...rows, whether_loa_restricted: overallRestriction(record), revision: record.updatedAt };
  } finally { client.release(); }
};

export const saveRestrictionDetails = async (record, body) => {
  const client = await postgresPool.connect();
  let mongoSaved = false;
  try {
    await ensureRestrictionColumns(client);
    await client.query('BEGIN');
    const current = await readRows(client, record.loa_no, true);
    const selected = validateRestrictionRows(body.rows, current, isRestricted(overallRestriction(record)));
    const snapshots = {};
    for (const table of restrictionTables) {
      const flags = new Map(selected[table].map((row) => [row.restriction_row_id, row.whether_loa_restricted]));
      snapshots[table] = current[table].map((row) => ({ ...row, whether_loa_restricted: flags.get(row.restriction_row_id) }));
      for (const row of selected[table]) {
        const result = await client.query(`UPDATE public.${table} SET whether_loa_restricted = $1 WHERE loa_no = $2 AND restriction_row_id = $3`, [row.whether_loa_restricted, record.loa_no, row.restriction_row_id]);
        if (result.rowCount !== 1) throw fail('The LOA rows have changed. Reload before updating.', 409);
      }
    }
    const updated = await LoaLetter.findOneAndUpdate(
      { _id: record._id, updatedAt: body.revision },
      { $set: { json_data: applyRestrictionJson(record.json_data, snapshots), restriction_sync_pending: true } },
      { new: true, runValidators: true }
    );
    if (!updated) throw fail('This LOA was changed by another request. Reload before updating.', 409);
    mongoSaved = true;
    await client.query('COMMIT');
    await LoaLetter.updateOne({ _id: updated._id, updatedAt: updated.updatedAt }, { $set: { restriction_sync_pending: false } });
    return await LoaLetter.findById(record._id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (mongoSaved) throw fail('Selections were saved in MongoDB, but saving both databases could not be confirmed. Reload the details and click Update to retry.', 503);
    throw error;
  } finally { client.release(); }
};
