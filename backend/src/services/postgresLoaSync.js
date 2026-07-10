import crypto from 'crypto';
import { postgresPool } from '../config/postgres.js';

const TABLES_WRITTEN = ['contracts', 'contract_schedules', 'awarded_items', 'item_breakups'];

const emptyToNull = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
};

const toNumeric = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value).replace(/[₹Rs,\s]/gi, '').replace(/[^0-9.+-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') {
    return null;
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const valueWithRaw = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      amount: toNumeric(value.amount ?? value.value),
      raw: emptyToNull(value.raw ?? value.text)
    };
  }

  return {
    amount: toNumeric(value),
    raw: emptyToNull(value)
  };
};

const makeId = (...parts) => {
  const raw = parts.map((part) => emptyToNull(part)).filter(Boolean).join('-');
  if (raw && raw.length <= 50) {
    return raw;
  }

  return crypto.createHash('sha1').update(raw || crypto.randomUUID()).digest('hex');
};

const getMongoId = (mongoDoc) => String(mongoDoc._id);

const getJsonData = (mongoDoc) => {
  if (typeof mongoDoc.toObject === 'function') {
    return mongoDoc.toObject().json_data || {};
  }

  return mongoDoc.json_data || {};
};

const getSchedules = (jsonData) => {
  if (Array.isArray(jsonData.schedule_breakup)) {
    return jsonData.schedule_breakup;
  }

  if (Array.isArray(jsonData.item_breakup)) {
    return jsonData.item_breakup;
  }

  if (Array.isArray(jsonData.awarded_quantities_rates?.schedules)) {
    return jsonData.awarded_quantities_rates.schedules;
  }

  if (Array.isArray(jsonData.loa_full?.awarded_quantities_rates?.schedules)) {
    return jsonData.loa_full.awarded_quantities_rates.schedules;
  }

  return [];
};

const getAwardedItems = (schedule) => {
  if (Array.isArray(schedule.awarded_items)) {
    return schedule.awarded_items;
  }

  if (Array.isArray(schedule.child_items)) {
    return schedule.child_items;
  }

  if (Array.isArray(schedule.children)) {
    return schedule.children;
  }

  return [];
};

const getBreakups = (schedule, awardedItem) => {
  if (Array.isArray(awardedItem.item_breaks)) {
    return awardedItem.item_breaks;
  }

  if (Array.isArray(awardedItem.breakup_lines)) {
    return awardedItem.breakup_lines;
  }

  if (Array.isArray(awardedItem.child_items)) {
    return awardedItem.child_items;
  }

  const targetId = emptyToNull(awardedItem.item_id || awardedItem.view_details_target_id || awardedItem.row_id);
  const breaks = Array.isArray(schedule.item_breaks) ? schedule.item_breaks : [];

  return breaks.filter((breakup) => {
    const parentId = emptyToNull(breakup.parent_awarded_item_id);
    if (targetId && parentId) {
      return targetId === parentId;
    }

    return emptyToNull(breakup.parent_awarded_item_sno) === emptyToNull(awardedItem.item_sno);
  });
};

const normalizeBreakup = (breakup) => ({
  item_sno: breakup.item_sno ?? breakup.s_no,
  item_code: breakup.item_code ?? breakup.item_no,
  item_desc: breakup.item_desc ?? breakup.description,
  qty_unit: breakup.qty_unit ?? breakup.unit,
  item_qty: breakup.item_qty ?? breakup.qty,
  unit_rate: breakup.unit_rate ?? breakup.rate,
  amount: breakup.amount,
  advt_value: breakup.advt_value,
  bid_rate_or_unit_rate: breakup.bid_rate_or_unit_rate ?? breakup.bid_rate,
  bid_amount: breakup.bid_amount,
  source: breakup.source || 'item_breakup'
});

const ensureLoaNoColumns = async (client) => {
  await client.query('ALTER TABLE public.contract_schedules ADD COLUMN IF NOT EXISTS loa_no VARCHAR(100)');
  await client.query('ALTER TABLE public.awarded_items ADD COLUMN IF NOT EXISTS loa_no VARCHAR(100)');
  await client.query('ALTER TABLE public.item_breakups ADD COLUMN IF NOT EXISTS loa_no VARCHAR(100)');
};

const backfillExistingLoaNo = async (client, loaNo, contractId) => {
  await client.query('UPDATE public.contracts SET loa_no = $1 WHERE _id = $2', [loaNo, contractId]);
  await client.query(
    `
      UPDATE public.contract_schedules
      SET loa_no = $1
      WHERE contract_id = $2 AND (loa_no IS NULL OR loa_no = '')
    `,
    [loaNo, contractId]
  );
  await client.query(
    `
      UPDATE public.awarded_items AS ai
      SET loa_no = $1
      FROM public.contract_schedules AS cs
      WHERE ai.schedule_id = cs.schedule_id
        AND cs.contract_id = $2
        AND (ai.loa_no IS NULL OR ai.loa_no = '')
    `,
    [loaNo, contractId]
  );
  await client.query(
    `
      UPDATE public.item_breakups AS ib
      SET loa_no = $1
      FROM public.contract_schedules AS cs
      WHERE ib.schedule_id = cs.schedule_id
        AND cs.contract_id = $2
        AND (ib.loa_no IS NULL OR ib.loa_no = '')
    `,
    [loaNo, contractId]
  );
};

const insertContract = async (client, mongoDoc, jsonData) => {
  const contractValue = valueWithRaw(jsonData.contract_value ?? mongoDoc.contract_value);
  const emd = valueWithRaw(jsonData.emd_amount);
  const performanceGuarantee = valueWithRaw(jsonData.performance_guarantee_amount);
  const railway = jsonData.railway_details || {};
  const contractor = jsonData.contractor || {};

  await client.query(
    `
      INSERT INTO public.contracts (
        _id, loa_no, letter_no_full, tender_no, bid_id, td_id, td_version,
        contractor_name, contractor_address, railway_zone, railway_division,
        railway_department, railway_office, letter_date, work_description,
        contract_value, contract_value_raw, emd_amount, emd_raw,
        performance_guarantee_amount, completion_period
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, CASE WHEN $14::text IS NULL THEN NULL ELSE TO_DATE($14, 'DD-MM-YYYY') END, $15,
        $16, $17, $18, $19,
        $20, $21
      )
    `,
    [
      getMongoId(mongoDoc),
      emptyToNull(mongoDoc.loa_no || jsonData.loa_no),
      emptyToNull(mongoDoc.letter_no_full || jsonData.letter_no_full),
      emptyToNull(mongoDoc.tender_no || jsonData.tender_no),
      emptyToNull(mongoDoc.bid_id || jsonData.bid_id),
      emptyToNull(jsonData.td_id),
      emptyToNull(jsonData.td_version),
      emptyToNull(mongoDoc.contractor_name || contractor.name),
      emptyToNull(contractor.address),
      emptyToNull(railway.railway || railway.zone),
      emptyToNull(railway.division),
      emptyToNull(railway.department),
      emptyToNull(railway.office),
      emptyToNull(mongoDoc.letter_date || jsonData.letter_date),
      emptyToNull(jsonData.work_description),
      contractValue.amount,
      contractValue.raw,
      emd.amount,
      emd.raw,
      performanceGuarantee.amount,
      emptyToNull(jsonData.completion_period)
    ]
  );
};

const insertSchedule = async (client, contractId, loaNo, schedule, index) => {
  const scheduleId = emptyToNull(schedule.schedule_id || schedule.row_id) || makeId(contractId, 'schedule', schedule.item_sno, index);

  await client.query(
    `
      INSERT INTO public.contract_schedules (
        schedule_id, contract_id, loa_no, item_sno, item_desc, description,
        item_directory, schedule_item_directory, record_type, bid_unit,
        advt_value, bid_rate_or_unit_rate, bid_type, bid_type_text,
        bid_amount, schedule_total
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `,
    [
      scheduleId,
      contractId,
      loaNo,
      emptyToNull(schedule.item_sno),
      emptyToNull(schedule.item_desc || schedule.description),
      emptyToNull(schedule.description),
      emptyToNull(schedule.item_directory),
      emptyToNull(schedule.schedule_item_directory),
      emptyToNull(schedule.record_type || schedule.rec_type),
      emptyToNull(schedule.bid_unit),
      toNumeric(schedule.advt_value || schedule.amount),
      toNumeric(schedule.bid_rate_or_unit_rate || schedule.bid_rate),
      emptyToNull(schedule.bid_type),
      emptyToNull(schedule.bid_type_text),
      toNumeric(schedule.bid_amount),
      toNumeric(schedule.schedule_total)
    ]
  );

  return scheduleId;
};

const insertAwardedItem = async (client, scheduleId, loaNo, item, index) => {
  const itemId = emptyToNull(item.item_id || item.row_id) || makeId(scheduleId, 'item', item.item_sno, index);

  await client.query(
    `
      INSERT INTO public.awarded_items (
        item_id, schedule_id, loa_no, record_type, item_sno, item_desc, item_code,
        item_qty, qty_unit, unit_rate, basic_value, escalation_percent,
        escalation_text, advt_value, bid_unit, bid_rate_or_unit_rate,
        bid_type, bid_type_text, bid_amount, view_details_target_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    `,
    [
      itemId,
      scheduleId,
      loaNo,
      emptyToNull(item.record_type || item.rec_type),
      emptyToNull(item.item_sno),
      emptyToNull(item.item_desc || item.description),
      emptyToNull(item.item_code),
      toNumeric(item.item_qty || item.qty),
      emptyToNull(item.qty_unit || item.unit),
      toNumeric(item.unit_rate || item.schedule_rate),
      toNumeric(item.basic_value || item.amount),
      toNumeric(item.escalation_percent),
      emptyToNull(item.escalation_text),
      toNumeric(item.advt_value || item.amount),
      emptyToNull(item.bid_unit),
      toNumeric(item.bid_rate_or_unit_rate || item.bid_rate),
      emptyToNull(item.bid_type),
      emptyToNull(item.bid_type_text),
      toNumeric(item.bid_amount),
      emptyToNull(item.view_details_target_id)
    ]
  );

  return itemId;
};

const insertBreakup = async (client, scheduleId, loaNo, parentItem, breakup) => {
  const normalized = normalizeBreakup(breakup);

  await client.query(
    `
      INSERT INTO public.item_breakups (
        schedule_id, loa_no, parent_awarded_item_id, parent_awarded_item_sno,
        parent_awarded_item_desc, item_sno, item_code, item_desc, qty_unit,
        item_qty, unit_rate, amount, advt_value, bid_rate_or_unit_rate,
        bid_amount, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `,
    [
      scheduleId,
      loaNo,
      emptyToNull(parentItem.item_id || parentItem.row_id),
      emptyToNull(parentItem.item_sno),
      emptyToNull(parentItem.item_desc || parentItem.description),
      emptyToNull(normalized.item_sno),
      emptyToNull(normalized.item_code),
      emptyToNull(normalized.item_desc),
      emptyToNull(normalized.qty_unit),
      toNumeric(normalized.item_qty),
      toNumeric(normalized.unit_rate),
      toNumeric(normalized.amount),
      toNumeric(normalized.advt_value || normalized.amount),
      toNumeric(normalized.bid_rate_or_unit_rate),
      toNumeric(normalized.bid_amount),
      emptyToNull(normalized.source)
    ]
  );
};

export const syncLoaToPostgres = async (mongoDoc) => {
  const mongoId = getMongoId(mongoDoc);
  const jsonData = getJsonData(mongoDoc);
  const loaNo = emptyToNull(mongoDoc.loa_no || jsonData.loa_no);

  if (!loaNo) {
    return {
      synced: false,
      skipped: true,
      reason: 'missing_loa_no',
      mongoId
    };
  }

  const client = await postgresPool.connect();
  let transactionStarted = false;

  try {
    await ensureLoaNoColumns(client);

    const existing = await client.query('SELECT _id FROM public.contracts WHERE loa_no = $1 LIMIT 1', [loaNo]);
    if (existing.rowCount > 0) {
      await backfillExistingLoaNo(client, loaNo, existing.rows[0]._id);
      console.info(`[postgres-sync] skipped duplicate loa_no=${loaNo} mongoId=${mongoId}`);
      return {
        synced: true,
        skipped: true,
        alreadyExists: true,
        reason: 'duplicate_loa_no',
        loa_no: loaNo,
        mongoId,
        postgresId: existing.rows[0]._id
      };
    }

    await client.query('BEGIN');
    transactionStarted = true;

    await insertContract(client, mongoDoc, jsonData);

    const schedules = getSchedules(jsonData);
    for (const [scheduleIndex, schedule] of schedules.entries()) {
      const scheduleId = await insertSchedule(client, mongoId, loaNo, schedule, scheduleIndex);
      const awardedItems = getAwardedItems(schedule);

      for (const [itemIndex, item] of awardedItems.entries()) {
        const itemId = await insertAwardedItem(client, scheduleId, loaNo, item, itemIndex);
        const breakups = getBreakups(schedule, { ...item, item_id: item.item_id || item.row_id || itemId });

        for (const breakup of breakups) {
          await insertBreakup(client, scheduleId, loaNo, { ...item, item_id: item.item_id || item.row_id || itemId }, breakup);
        }
      }
    }

    await client.query('COMMIT');
    console.info(`[postgres-sync] success loa_no=${loaNo} mongoId=${mongoId}`);

    return {
      synced: true,
      skipped: false,
      alreadyExists: false,
      loa_no: loaNo,
      mongoId,
      tablesWritten: TABLES_WRITTEN
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(`[postgres-sync] rollback failed loa_no=${loaNo} mongoId=${mongoId}`, rollbackError);
      }
    }

    console.error(`[postgres-sync] failed loa_no=${loaNo} mongoId=${mongoId}`, error);
    throw error;
  } finally {
    client.release();
  }
};
