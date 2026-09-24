import he from 'he';

const clean = (text) => he.decode(text).replace(/\s+/g, ' ').trim();
const key = (text) => clean(text).toLowerCase().replace(/[^a-z0-9]/g, '');

// Expand the logical grid, keeping a merged cell's text in its first column.
// Only rows owned by this table are included; nested layout tables are separate.
export function tableRows($, table) {
  const spans = [];
  return $(table).find('tr').filter((_, row) => $(row).closest('table')[0] === table).toArray().map((row) => {
    const cells = [];
    spans.forEach((span, i) => {
      if (span?.remaining > 0) { cells[i] = span.text; span.remaining--; }
    });
    let column = 0;
    $(row).children('td,th').each((_, cell) => {
      while (cells[column] !== undefined) column++;
      const element = $(cell).clone();
      element.find('script,style,table').remove();
      element.find('br').replaceWith(' ');
      const text = clean(element.text());
      const width = Math.min(100, Math.max(1, Number.parseInt($(cell).attr('colspan'), 10) || 1));
      const height = Math.min(10000, Math.max(1, Number.parseInt($(cell).attr('rowspan'), 10) || 1));
      for (let offset = 0; offset < width; offset++) {
        const value = offset === 0 ? text : '';
        cells[column + offset] = value;
        if (height > 1) spans[column + offset] = { text: value, remaining: height - 1 };
      }
      column += width;
    });
    return { row, cells };
  });
}

const aliases = {
  item_sno: ['sno', 'srno', 'serialno', 'serialnumber', 'itemsno'],
  item_code: ['itemno', 'itemnumber', 'itemcode', 'code'],
  item_desc: ['descriptionofitem', 'itemdescription', 'itemdesc', 'description', 'particulars'],
  qty_unit: ['unit', 'qtyunit', 'uom', 'unitofmeasurement'],
  item_qty: ['qty', 'quantity', 'itemqty'],
  unit_rate: ['rate', 'raters', 'unitrate', 'unitraters'],
  amount: ['amount', 'amountrs', 'totalamount', 'value']
};
export function breakupHeaders(cells) {
  const columns = {};
  cells.forEach((text, index) => {
    const field = Object.keys(aliases).find((name) => aliases[name].includes(key(text)));
    if (field) columns[field] = index;
  });
  return columns.item_desc !== undefined && columns.item_code !== undefined
    && (columns.item_qty !== undefined || columns.amount !== undefined) ? columns : null;
}

export function visibleBreakupGroups($) {
  const groups = new Map();
  $('table').each((_, table) => {
    let group = null, headers = null, scheduleLabel = '';
    for (const { row, cells } of tableRows($, table)) {
      if (/^schedule$/i.test(cells[0] || '') && cells[1]) {
        scheduleLabel = cells[1]; group = null; headers = null; continue;
      }
      const target = ($(row).attr('id') || '').match(/^tr(.+)$/i);
      const itemHeader = (cells[0] || '').match(/^Item\s*[-:]\s*(.+)/i);
      if (itemHeader) {
        const identity = target?.[1] || `${scheduleLabel}|${itemHeader[1]}`;
        group = { view_details_target_id: target?.[1] || '', schedule_label: scheduleLabel,
          item_sno: itemHeader[1], item_desc: cells[1] || '', item_breaks: [] };
        groups.set(identity, group); headers = null; continue;
      }
      if (!group) continue;
      const detected = breakupHeaders(cells);
      if (detected) { headers = detected; continue; }
      if (!headers) continue;
      if (/^(?:grand\s+)?total\b/i.test(cells.find(Boolean) || '')) { headers = null; continue; }
      const item = Object.fromEntries(Object.entries(headers).map(([field, index]) => [field, cells[index] || '']));
      if (!(item.item_code || item.item_desc || item.amount)) continue;
      group.item_breaks.push({ item_sno: '', item_code: '', item_desc: '', qty_unit: '', item_qty: '',
        unit_rate: '', amount: '', ...item, advt_value: item.amount || '',
        bid_rate_or_unit_rate: '', bid_amount: '', source: 'item_breakup' });
    }
  });
  return groups;
}
