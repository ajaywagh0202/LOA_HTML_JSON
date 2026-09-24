import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRestrictionJson } from './loaRestrictionJson.js';
import { isRestricted, validateRestrictionRows, saveRestrictionDetails } from './loaRestrictionService.js';
import { postgresPool } from '../config/postgres.js';
import LoaLetter from '../models/LoaLetter.js';

const snapshots = {
  contract_schedules: [{ schedule_id: 's', restriction_row_id: 's1', whether_loa_restricted: 'N' }],
  awarded_items: [{ schedule_id: 's', item_id: 'a', restriction_row_id: 'a1', whether_loa_restricted: 'Y' }],
  item_breakups: ['a', 'b'].map((parent, i) => ({ schedule_id: 's', parent_awarded_item_id: parent,
    item_code: '1', item_sno: '1', item_desc: 'Repeated', restriction_row_id: `b${i}`, whether_loa_restricted: i ? 'N' : 'Y' }))
};
test('updates nested copies independently, preserves data and separates identical codes by parent', () => {
  const original = { unrelated: { amount: 99 }, schedule_breakup: [{ schedule_id: 's',
    awarded_items: [{ item_id: 'a' }], item_breaks: snapshots.item_breakups.map(({ whether_loa_restricted, ...row }) => row) }],
    loa_full: { awarded_quantities_rates: { schedules: [{ row_id: 's', children: [{ row_id: 'a',
      breakup_lines: [{ s_no: '1', item_no: '1', description: 'Repeated' }] }] }] } } };
  const result = applyRestrictionJson(original, snapshots);
  assert.equal(result.schedule_breakup[0].whether_loa_restricted, 'N');
  assert.equal(result.schedule_breakup[0].awarded_items[0].whether_loa_restricted, 'Y');
  assert.deepEqual(result.schedule_breakup[0].item_breaks.map(r => r.whether_loa_restricted), ['Y', 'N']);
  assert.equal(result.loa_full.awarded_quantities_rates.schedules[0].children[0].breakup_lines[0].whether_loa_restricted, 'Y');
  assert.deepEqual(result.unrelated, { amount: 99 });
  assert.equal(original.schedule_breakup[0].whether_loa_restricted, undefined);
});
test('accepts Y/Yes and rejects tampered, duplicate, missing or unrestricted selections', () => {
  assert.ok(isRestricted(' Yes ')); assert.ok(isRestricted('y')); assert.ok(!isRestricted('No'));
  assert.deepEqual(validateRestrictionRows(snapshots, snapshots, true).item_breakups.map(r => r.whether_loa_restricted), ['Y', 'N']);
  assert.throws(() => validateRestrictionRows(snapshots, snapshots, false));
  const bad = structuredClone(snapshots); bad.item_breakups[1].restriction_row_id = 'b0';
  assert.throws(() => validateRestrictionRows(bad, snapshots, true));
  assert.throws(() => validateRestrictionRows({}, snapshots, true));
});
test('writes all three PostgreSQL tables and Mongo json_data; reports partial commit failure', async () => {
  const oldConnect = postgresPool.connect, oldUpdate = LoaLetter.findOneAndUpdate, oldOne = LoaLetter.updateOne, oldFind = LoaLetter.findById;
  let commitFails = false, mongoPayload;
  const queries = [];
  const record = { _id: 'test', loa_no: 'loa', whether_loa_restricted: 'Y', updatedAt: new Date(), json_data: { retained: true } };
  postgresPool.connect = async () => ({ release() {}, async query(sql, params) {
    queries.push([sql, params]);
    if (sql === 'COMMIT' && commitFails) throw new Error('connection lost');
    const table = Object.keys(snapshots).find(t => sql.startsWith(`SELECT * FROM public.${t} `));
    return table ? { rows: snapshots[table] } : { rowCount: 1 };
  } });
  LoaLetter.findOneAndUpdate = async (filter, payload) => { mongoPayload = payload; return record; };
  LoaLetter.updateOne = async () => ({ matchedCount: 1 });
  LoaLetter.findById = async () => record;
  try {
    await saveRestrictionDetails(record, { rows: snapshots, revision: record.updatedAt });
    assert.equal(mongoPayload.$set.json_data.retained, true);
    assert.equal(mongoPayload.$set.contract_schedules, undefined);
    assert.equal(mongoPayload.$set.json_data.item_breakups[1].whether_loa_restricted, 'N');
    for (const table of Object.keys(snapshots)) assert.ok(queries.some(([sql]) => sql.startsWith(`UPDATE public.${table} `)));
    commitFails = true;
    await assert.rejects(saveRestrictionDetails(record, { rows: snapshots, revision: record.updatedAt }), error => error.statusCode === 503);
    assert.ok(queries.some(([sql]) => sql === 'ROLLBACK'));
  } finally { postgresPool.connect = oldConnect; LoaLetter.findOneAndUpdate = oldUpdate; LoaLetter.updateOne = oldOne; LoaLetter.findById = oldFind; }
});
