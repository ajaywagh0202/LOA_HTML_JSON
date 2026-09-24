import React, { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { getLoaRestrictions, updateLoaRestrictions } from '../api/loaApi.js';
import { scheduleColumnDefs, itemColumnDefs } from '../pages/ViewLOA.jsx';

const tables = [
  { key: 'contract_schedules', title: 'Schedule Details', columns: scheduleColumnDefs },
  { key: 'awarded_items', title: 'Awarded Items', columns: [
    { field: 'item_id', headerName: 'Awarded Item ID', minWidth: 170 },
    ...itemColumnDefs.filter((column) => !column.field.startsWith('parent_') && column.field !== 'source'),
    { field: 'basic_value', headerName: 'Basic Value', minWidth: 130 },
    { field: 'bid_type_text', headerName: 'Bid Type', minWidth: 140 }
  ] },
  { key: 'item_breakups', title: 'Item Breakups', columns: itemColumnDefs }
];
const yes = (value) => ['Y', 'YES'].includes(String(value ?? '').trim().toUpperCase());
const value = (input) => input === null || input === undefined || input === '' ? '-' : String(input);
const defaultColDef = { sortable: true, filter: 'agTextColumnFilter', floatingFilter: true, resizable: true, minWidth: 110 };

const RestrictionGrid = ({ definition, rows, editable, saving, onToggle }) => {
  const columns = useMemo(() => [
    ...(editable ? [{
      field: 'whether_loa_restricted', headerName: 'Restricted', pinned: 'left', width: 125,
      filter: false, floatingFilter: false, sortable: false,
      cellRenderer: ({ data }) => <input type="checkbox" checked={yes(data.whether_loa_restricted)} disabled={saving}
        aria-label={`Restrict ${definition.title} row ${data.item_sno || data.item_code || data.restriction_row_id}`}
        onChange={(event) => onToggle(definition.key, data.restriction_row_id, event.target.checked)} />
    }] : []),
    ...definition.columns
  ], [definition, editable, saving, onToggle]);
  return <div className="view-loa-section">
    <h3>{definition.title} <span className="restriction-row-count">({rows.length})</span></h3>
    <div className="panel grid-panel"><div className="view-loa-grid item-grid">
      <AgGridReact rowData={rows} columnDefs={columns} defaultColDef={defaultColDef}
        getRowId={({ data }) => data.restriction_row_id} animateRows={false}
        pagination paginationPageSize={25} paginationPageSizeSelector={[10, 25, 50, 100]} />
    </div></div>
  </div>;
};

export default function LoaRestrictionEditor({ record, onSavingChange }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getLoaRestrictions(record._id).then((result) => {
      if (active) { setDetails(result); setDirty(false); }
    }).catch((err) => {
      if (active) setError(err.response?.data?.message || 'Unable to load LOA details. Please retry.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [record._id, attempt]);

  const toggle = React.useCallback((table, id, checked) => {
    setDetails((current) => ({ ...current, [table]: current[table].map((row) => row.restriction_row_id === id
      ? { ...row, whether_loa_restricted: checked ? 'Y' : 'N' } : row) }));
    setDirty(true); setSuccess(''); setError('');
  }, []);
  const update = async () => {
    if (saving) return;
    setSaving(true); onSavingChange(true); setError(''); setSuccess('');
    try {
      const rows = Object.fromEntries(tables.map(({ key }) => [key, details[key].map((row) => ({
        restriction_row_id: row.restriction_row_id, whether_loa_restricted: yes(row.whether_loa_restricted) ? 'Y' : 'N'
      }))]));
      const result = await updateLoaRestrictions(record._id, rows, details.revision);
      setDetails((current) => ({ ...current, revision: result.revision }));
      setDirty(false); setSuccess(result.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed. Your selections are retained; please retry.');
    } finally { setSaving(false); onSavingChange(false); }
  };
  if (loading) return <div className="panel state-page" role="status"><Loader2 className="spin" size={22} />Loading LOA details</div>;
  if (!details) return <div className="notice error" role="alert">{error}<button type="button" className="button secondary" onClick={() => setAttempt((n) => n + 1)}>Retry</button></div>;
  const contract = details.contract;
  const summary = [
    ['LOA No', contract.loa_no], ['Tender No', contract.tender_no], ['Bid ID', contract.bid_id],
    ['Tender ID', contract.tender_id ?? contract.td_id], ['Tender Version', contract.tender_version ?? contract.td_version],
    ['Letter Date', record.letter_date], ['Work Description', contract.work_description],
    ['Contract Value', contract.contract_value], ['Work Name', contract.work_name ?? contract.work_description]
  ];
  return <div className="page-stack restriction-editor" aria-busy={saving}>
    <div className="view-loa-section"><h3>LOA Details</h3>
      <div className="panel loa-summary-wrap"><div className="table-wrap"><table className="loa-summary-table">
        <thead><tr>{summary.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody><tr>{summary.map(([label, content]) => <td key={label}>{value(content)}</td>)}</tr></tbody>
      </table></div></div>
    </div>
    {yes(details.whether_loa_restricted) && <p className="single-loa-hint">Select restricted rows. Checked rows save as Y; unchecked rows save as N. {dirty ? 'You have unsaved changes.' : ''}</p>}
    {tables.map((definition) => <RestrictionGrid key={definition.key} definition={definition} rows={details[definition.key]}
      editable={yes(details.whether_loa_restricted)} saving={saving} onToggle={toggle} />)}
    {error && <div className="notice error" role="alert">{error}</div>}
    {success && <div className="notice success" role="status">{success}</div>}
    <div className="restriction-actions">
      <button className="button secondary" type="button" disabled={saving} onClick={() => {
        if (!dirty || window.confirm('Discard unsaved checkbox changes and reload?')) { setSuccess(''); setAttempt((n) => n + 1); }
      }}><RefreshCw size={17} />Reload details</button>
      <button className="button primary" type="button" disabled={saving} onClick={update}>
        {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}{saving ? 'Updating...' : 'Update'}
      </button>
    </div>
  </div>;
}
