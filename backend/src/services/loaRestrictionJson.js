const text = (value) => String(value ?? '');

// Preserve the extracted document while updating its alternate row representations.
export function applyRestrictionJson(json, snapshots) {
  const result = structuredClone(json || {});
  const schedules = snapshots.contract_schedules;
  const items = snapshots.awarded_items;
  const breaks = snapshots.item_breakups;
  const visit = (node, scheduleId = '', itemId = '') => {
    if (!node || typeof node !== 'object') return;
    for (const [key, children] of Object.entries(node)) {
      if (!Array.isArray(children)) { visit(children, scheduleId, itemId); continue; }
      const used = new Set();
      for (const row of children) {
        if (!row || typeof row !== 'object') continue;
        let sid = scheduleId;
        let iid = itemId;
        let match;
        if (['schedule_breakup', 'item_breakup', 'schedules', 'contract_schedules'].includes(key)) {
          sid = text(row.schedule_id ?? row.row_id);
          match = schedules.find((s) => text(s.schedule_id) === sid);
        } else if (['awarded_items', 'children', 'child_items'].includes(key)) {
          iid = text(row.item_id ?? row.row_id);
          match = items.find((i) => text(i.schedule_id) === sid && text(i.item_id) === iid);
        } else if (['item_breaks', 'breakup_lines', 'item_breakups'].includes(key)) {
          const parent = text(row.parent_awarded_item_id ?? (iid || row.item_id));
          match = breaks.find((b) => !used.has(b.restriction_row_id)
            && text(b.schedule_id) === sid && text(b.parent_awarded_item_id) === parent
            && text(b.item_sno) === text(row.item_sno ?? row.s_no)
            && text(b.item_code) === text(row.item_code ?? row.item_no)
            && text(b.item_desc) === text(row.item_desc ?? row.description));
          if (match) used.add(match.restriction_row_id);
        }
        if (match) row.whether_loa_restricted = match.whether_loa_restricted;
        visit(row, sid, iid);
      }
    }
  };
  visit(result);
  // Keep the exact database rows (including stable identities) inside json_data.
  Object.assign(result, snapshots);
  return result;
}
