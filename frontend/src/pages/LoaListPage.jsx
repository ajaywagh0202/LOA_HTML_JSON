import { CheckCircle2, DatabaseZap, Eye, FileCode2, ListFilter, Loader2, Search } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { getLoaLetters, syncLoaToPostgres } from '../api/loaApi.js';

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2
  }).format(value);
};

const LoaListPage = () => {
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [syncStatus, setSyncStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [syncingIds, setSyncingIds] = useState({});

  const canGoBack = pagination.page > 1;
  const canGoNext = pagination.page < pagination.pages;

  const query = useMemo(
    () => ({
      page: pagination.page,
      limit: pagination.limit,
      search,
      syncStatus
    }),
    [pagination.page, pagination.limit, search, syncStatus]
  );

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');
      const response = await getLoaLetters(query);
      setRecords(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load LOA records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [query]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setSearch(searchInput.trim());
  };

  const handleSync = async (record) => {
    try {
      setError('');
      setMessage('');
      setSyncingIds((current) => ({ ...current, [record._id]: true }));

      const response = await syncLoaToPostgres(record._id);
      setRecords((current) =>
        current.map((item) =>
          item._id === record._id
            ? { ...item, postgres_synced: true, postgres_synced_at: new Date().toISOString() }
            : item
        )
      );
      if (syncStatus === 'unsynced') {
        await loadRecords();
      }
      setMessage(response.alreadyExists ? 'Already synced to PostgreSQL.' : 'Synced to PostgreSQL successfully.');
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to sync LOA to PostgreSQL.');
    } finally {
      setSyncingIds((current) => ({ ...current, [record._id]: false }));
    }
  };

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      floatingFilter: true,
      resizable: true,
      minWidth: 120
    }),
    []
  );

  const columnDefs = [
    {
      field: 'loa_no',
      headerName: 'LOA No',
      minWidth: 190,
      cellClass: 'strong-cell'
    },
    {
      field: 'tender_no',
      headerName: 'Tender No',
      minWidth: 250,
      flex: 1,
      wrapText: true,
      autoHeight: true,
      valueFormatter: ({ value }) => value || '-'
    },
    {
      field: 'contractor_name',
      headerName: 'Contractor Name',
      minWidth: 240,
      flex: 1,
      wrapText: true,
      autoHeight: true,
      valueFormatter: ({ value }) => value || '-'
    },
    {
      field: 'letter_date',
      headerName: 'Date',
      minWidth: 135,
      valueFormatter: ({ value }) => value || '-'
    },
    {
      field: 'contract_value',
      headerName: 'Contract Value',
      minWidth: 165,
      filter: 'agNumberColumnFilter',
      valueFormatter: ({ value }) => formatCurrency(value)
    },
    {
      field: 'postgres_synced',
      headerName: 'PostgreSQL',
      minWidth: 155,
      filter: false,
      sortable: true,
      cellRenderer: ({ value }) => (
        <span className={`status-badge ${value ? 'success' : 'muted'}`}>
          {value ? <CheckCircle2 size={14} /> : null}
          {value ? 'Synced' : 'Not synced'}
        </span>
      )
    },
    {
      colId: 'actions',
      headerName: 'Actions',
      minWidth: 175,
      maxWidth: 190,
      sortable: false,
      filter: false,
      floatingFilter: false,
      pinned: 'right',
      cellRenderer: ({ data: record }) => (
        <div className="row-actions ag-grid-row-actions">
          <button
            className="icon-button"
            type="button"
            disabled={Boolean(syncingIds[record._id]) || Boolean(record.postgres_synced)}
            onClick={() => handleSync(record)}
            title={record.postgres_synced ? 'Already synced' : 'Sync to PostgreSQL'}
          >
            {syncingIds[record._id] ? <Loader2 className="spin" size={17} /> : <DatabaseZap size={17} />}
          </button>
          <Link className="icon-button" to={`/loa/${record._id}`} title="View">
            <Eye size={17} />
          </Link>
          <button
            className="icon-button"
            type="button"
            disabled={!record.html_file_name}
            onClick={() => window.open(`/loa-file/${encodeURIComponent(record.loa_no)}`, '_blank', 'noopener,noreferrer')}
            title={record.html_file_name ? 'View saved HTML file' : 'Re-upload this LOA to save its HTML file'}
          >
            <FileCode2 size={17} />
          </button>
        </div>
      )
    }
  ];

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOA Records</p>
          <h2>Stored Letters</h2>
        </div>
      </div>

      <div className="panel table-panel">
        <form className="table-toolbar" onSubmit={handleSearchSubmit}>
          <label className="search-box">
            <Search size={18} />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search LOA, tender, contractor"
            />
          </label>
          <label className="sync-filter" title="Filter records by PostgreSQL sync status">
            <ListFilter size={18} />
            <span>PostgreSQL</span>
            <select
              value={syncStatus}
              onChange={(event) => {
                setSyncStatus(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              <option value="all">All entries</option>
              <option value="unsynced">Unsynced only</option>
              <option value="synced">Synced only</option>
            </select>
          </label>
          <button className="button primary" type="submit">
            <Search size={18} />
            Search
          </button>
        </form>

        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}

        <div className="records-grid">
          <AgGridReact
            rowData={records}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={({ data }) => data._id}
            loading={loading}
            animateRows={false}
            rowHeight={58}
            headerHeight={42}
            floatingFiltersHeight={38}
            overlayLoadingTemplate="Loading LOA records..."
            overlayNoRowsTemplate="No records found"
          />
        </div>

        <div className="pagination">
          <span>
            Page {pagination.page} of {pagination.pages || 1} ({pagination.total} records)
          </span>
          <div>
            <button
              className="button secondary"
              type="button"
              disabled={!canGoBack}
              onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
            >
              Previous
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!canGoNext}
              onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LoaListPage;
