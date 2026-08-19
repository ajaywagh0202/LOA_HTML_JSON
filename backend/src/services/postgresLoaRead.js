import { postgresPool } from '../config/postgres.js';

export const listPostgresLoas = async () => {
  const client = await postgresPool.connect();

  try {
    const result = await client.query(
      `
        SELECT
          c.loa_no,
          c.work_description AS work_name
        FROM public.contracts AS c
        WHERE c.loa_no IS NOT NULL
          AND BTRIM(c.loa_no::text) <> ''
          AND (NOT (to_jsonb(c) ? 'deleted_at') OR to_jsonb(c)->>'deleted_at' IS NULL)
          AND LOWER(COALESCE(to_jsonb(c)->>'is_deleted', 'false')) NOT IN ('true', 't', '1', 'yes')
        ORDER BY c.loa_dt DESC NULLS LAST, c.loa_no ASC
      `
    );

    return result.rows;
  } finally {
    client.release();
  }
};

export const getPostgresLoaDetails = async (loaNo) => {
  const client = await postgresPool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;

    const contractResult = await client.query(
      `
        SELECT
          c.loa_no,
          c.tender_no,
          c.bid_id,
          COALESCE(to_jsonb(c)->>'tender_id', to_jsonb(c)->>'td_id') AS tender_id,
          COALESCE(to_jsonb(c)->>'tender_version', to_jsonb(c)->>'td_version') AS tender_version,
          c.letter_date,
          c.work_description,
          c.contract_value,
          c.work_description AS work_name
        FROM public.contracts AS c
        WHERE c.loa_no = $1
          AND (NOT (to_jsonb(c) ? 'deleted_at') OR to_jsonb(c)->>'deleted_at' IS NULL)
          AND LOWER(COALESCE(to_jsonb(c)->>'is_deleted', 'false')) NOT IN ('true', 't', '1', 'yes')
        LIMIT 1
      `,
      [loaNo]
    );
    const schedulesResult = await client.query(
      `
        SELECT
          cs.schedule_id,
          cs.item_sno,
          cs.item_desc,
          cs.description,
          cs.item_directory,
          cs.schedule_item_directory,
          cs.record_type,
          cs.bid_unit,
          cs.advt_value,
          cs.bid_rate_or_unit_rate,
          cs.bid_type,
          cs.bid_type_text,
          cs.bid_amount,
          cs.schedule_total
        FROM public.contract_schedules AS cs
        WHERE cs.loa_no = $1
          AND (NOT (to_jsonb(cs) ? 'deleted_at') OR to_jsonb(cs)->>'deleted_at' IS NULL)
          AND LOWER(COALESCE(to_jsonb(cs)->>'is_deleted', 'false')) NOT IN ('true', 't', '1', 'yes')
      `,
      [loaNo]
    );
    const itemsResult = await client.query(
      `
        SELECT
          ib.schedule_id,
          ib.parent_awarded_item_id,
          ib.parent_awarded_item_sno,
          ib.parent_awarded_item_desc,
          ib.item_sno,
          ib.item_code,
          ib.item_desc,
          ib.qty_unit,
          ib.item_qty,
          ib.unit_rate,
          ib.amount,
          ib.advt_value,
          ib.bid_rate_or_unit_rate,
          ib.bid_amount,
          ib.source
        FROM public.item_breakups AS ib
        WHERE ib.loa_no = $1
          AND (NOT (to_jsonb(ib) ? 'deleted_at') OR to_jsonb(ib)->>'deleted_at' IS NULL)
          AND LOWER(COALESCE(to_jsonb(ib)->>'is_deleted', 'false')) NOT IN ('true', 't', '1', 'yes')
      `,
      [loaNo]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    return {
      contract: contractResult.rows[0] || null,
      schedules: schedulesResult.rows,
      items: itemsResult.rows
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(`[loa-view] PostgreSQL rollback failed loa_no=${loaNo}`, rollbackError);
      }
    }

    throw error;
  } finally {
    client.release();
  }
};
