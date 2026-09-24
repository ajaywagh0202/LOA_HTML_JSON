import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { parseLoaHtml } from './loaParser.js';
import { tableRows, visibleBreakupGroups } from './loaTables.js';
import { postgresPool } from '../config/postgres.js';
import { syncLoaToPostgres } from '../services/postgresLoaSync.js';

const fixture = fs.readFileSync(new URL('../../HTML_DATA/00934360101107_CR-DRMWBB-2023-33-09.html', import.meta.url), 'utf8');
const parse = (html) => parseLoaHtml(html).json_data;
const counts = (json) => json.schedule_breakup.map(s => [s.schedule_id, s.awarded_items.length, s.item_breaks.length]);
const expected = [[ '16385602', 1, 30 ], [ '16385857', 1, 7 ], [ '16385944', 9, 9 ],
  [ '16386453', 1, 29 ], [ '16387038', 1, 4 ], [ '16387067', 9, 9 ],
  [ '16387314', 1, 25 ], [ '16388182', 1, 2 ], [ '16388280', 1, 25 ],
  [ '16388474', 1, 12 ], [ '16388521', 1, 22 ]];

test('awarded and reference rows use visible unit labels rather than hidden unit IDs', () => {
  const $ = cheerio.load(fixture);
  const json = parse(fixture);
  let checked = 0;
  for (const schedule of json.schedule_breakup) {
    for (const item of schedule.awarded_items) {
      const label = $(`[id="qtyUnitDesc${item.item_id}"]`).text().trim();
      if (!label) continue;
      checked++;
      assert.equal(item.qty_unit, label);
      for (const reference of [json.awarded_quantities_rates, json.loa_full.awarded_quantities_rates]) {
        assert.equal(reference.schedules.find(s => s.row_id === schedule.schedule_id).children.find(i => i.row_id === item.item_id).unit, label);
      }
    }
  }
  assert.ok(checked >= 18);
  assert.equal(json.awarded_quantities_rates.schedules.find(s => s.row_id === '16387067').children.find(i => i.row_id === '16387099').unit, 'RM');
});

test('unit labels survive renamed spans and fall back to hidden JSON descriptions', () => {
  for (const removeLabel of [false, true]) {
    const $ = cheerio.load(fixture);
    $('[id^="qtyUnitDesc"]').each((_, element) => {
      if (removeLabel) $(element).remove();
      else $(element).removeAttr('id');
    });
    const json = parse($.html());
    assert.equal(json.schedule_breakup.find(s => s.schedule_id === '16387067').awarded_items.find(i => i.item_id === '16387099').qty_unit, 'RM');
  }
});

test('sample retains 11 schedules, 27 awarded items and all 174 breakup rows including merged descriptions', () => {
  const json = parse(fixture);
  assert.equal(json.loa_no, '00934360101107');
  assert.equal(json.contract_value.amount, 172771492.17);
  assert.deepEqual(counts(json), expected);
  const rows = json.schedule_breakup[0].item_breaks;
  assert.match(rows[0].item_desc, /^Drilling of NX size borehole/);
  assert.equal(rows[0].item_qty, null);
  assert.equal(rows[1].item_code, '021051');
  assert.equal(rows[1].amount, '286440.30');
  const lines = json.awarded_quantities_rates.schedules[0].children[0].breakup_lines;
  assert.equal(lines.length, 30);
  assert.equal(lines[0].is_heading, true);
  assert.equal(lines[1].qty, 90);
});

test('blank schedule bids remain null without inheriting another schedule or its total', () => {
  const json = parse(fixture);
  const schedule = json.schedule_breakup.find(s => s.schedule_id === '16387067');
  for (const key of ['bid_rate_or_unit_rate', 'bid_type', 'bid_type_text', 'bid_amount']) assert.equal(schedule[key], null);
  assert.equal(schedule.schedule_total, '18917694.80');
  assert.equal(json.schedule_breakup[0].bid_rate_or_unit_rate, '25.79');
  assert.equal(json.awarded_quantities_rates.schedules.find(s => s.row_id === '16387067').bid_amount, null);
  assert.equal(json.rebate_rate, 0);
  const visit = (value) => {
    if (typeof value === 'string') assert.notEqual(value.trim(), '');
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(json);
});

test('existing PostgreSQL schedule refresh clears old bid values with SQL null', async () => {
  const originalConnect = postgresPool.connect;
  const writes = [];
  postgresPool.connect = async () => ({ release() {}, async query(sql, params) {
    writes.push({ sql, params });
    return sql.startsWith('SELECT _id') ? { rows: [{ _id: 'existing' }], rowCount: 1 } : { rows: [], rowCount: 1 };
  } });
  try {
    await syncLoaToPostgres({ _id: 'parser-test-only', ...parseLoaHtml(fixture) });
    const update = writes.find(w => w.sql.includes('UPDATE public.contract_schedules') && w.params?.[0] === '16387067');
    assert.deepEqual(update.params, ['16387067', null, null, null, null]);
    assert.ok(!update.sql.includes('COALESCE'));
  } finally { postgresPool.connect = originalConnect; }
});

test('visible details work without hidden JSON or detail anchors', () => {
  const $ = cheerio.load(fixture);
  $('input[id^="loaData"]').remove();
  assert.deepEqual(counts(parse($.html())), expected);
});

test('hidden JSON in a renamed textarea and named controls keeps the same rows', () => {
  const $ = cheerio.load(fixture);
  $('input[id^="loaData"]').each((_, element) => {
    const replacement = $('<textarea name="updatedSchedulePayload"></textarea>').text($(element).attr('value'));
    $(element).replaceWith(replacement);
  });
  $('input[id]').each((_, element) => { $(element).attr('name', $(element).attr('id')).removeAttr('id'); });
  assert.deepEqual(counts(parse($.html())), expected);
});

test('header aliases, reordered columns, rowspan, colspan, repeated headers and nested tables', () => {
  const $ = cheerio.load(`<table><tr><td><table id="details">
    <tr><td>Schedule</td><td colspan="6">1-Test</td></tr>
    <tr id="tr123"><td>Item - 1</td><td colspan="6">Work</td></tr>
    <tr><th>Item description</th><th>Item code</th><th>Sr. No.</th><th>Quantity</th><th>UOM</th><th>Amount (Rs)</th><th>Unit Rate</th></tr>
    <tr><td>Heading</td><td colspan="6"></td></tr>
    <tr><td rowspan="2">Work detail</td><td>001</td><td>1</td><td>2</td><td>m</td><td>20</td><td>10</td></tr>
    <tr><td>002</td><td>2</td><td>3</td><td>m</td><td>30</td><td>10</td></tr>
    <tr><th>Item description</th><th>Item code</th><th>Sr. No.</th><th>Quantity</th><th>UOM</th><th>Amount (Rs)</th><th>Unit Rate</th></tr>
    <tr><td>Total</td><td colspan="6">50</td></tr>
  </table></td></tr></table>`);
  const groups = visibleBreakupGroups($);
  assert.equal(groups.size, 1);
  const rows = groups.get('123').item_breaks;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].item_desc, 'Heading');
  assert.equal(rows[1].item_code, '001');
  assert.equal(rows[2].item_desc, 'Work detail');
  assert.equal(rows[2].item_qty, '3');
  assert.equal(rows[2].amount, '30');
  assert.equal(tableRows($, $('table')[0]).length, 1);
});

test('unknown table columns are retained and scripts are not executed', () => {
  const json = parse('<p>LOA No: 123456789</p><table><tr><th>New field</th><th>New value</th></tr><tr><td>A</td><td>42<script>throw new Error("do not execute")</script></td></tr></table>');
  assert.deepEqual(json.source_tables[0].rows, [['New field', 'New value'], ['A', '42']]);
  assert.ok(json.parse_warnings.length);
});

test('new LOA PostgreSQL sync inserts every recovered breakup using existing columns', async () => {
  const originalConnect = postgresPool.connect;
  const writes = [];
  postgresPool.connect = async () => ({ release() {}, async query(sql, params) {
    writes.push({ sql, params });
    return { rows: [], rowCount: 0 };
  } });
  try {
    await syncLoaToPostgres({ _id: 'parser-test-only', ...parseLoaHtml(fixture) });
    const rows = writes.filter(w => w.sql.includes('INSERT INTO public.item_breakups'));
    assert.equal(rows.length, 174);
    assert.match(rows[0].params[7], /^Drilling of NX size borehole/);
    assert.equal(rows[0].params[9], null);
    assert.equal(rows[1].params[6], '021051');
    assert.equal(rows[1].params[11], 286440.3);
    const rockBolt = writes.find(w => w.sql.includes('INSERT INTO public.awarded_items') && w.params[0] === '16387099');
    assert.equal(rockBolt.params[8], 'RM');
    assert.ok(writes.some(w => w.sql === 'COMMIT'));
  } finally { postgresPool.connect = originalConnect; }
});
