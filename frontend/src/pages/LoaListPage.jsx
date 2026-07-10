import { CheckCircle2, DatabaseZap, Edit, Eye, Loader2, Search, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteLoa, getLoaLetters, syncLoaToPostgres } from '../api/loaApi.js';

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
      search
    }),
    [pagination.page, pagination.limit, search]
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

  const handleDelete = async (record) => {
    const confirmed = window.confirm(`Delete LOA ${record.loa_no}?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteLoa(record._id);
      await loadRecords();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete LOA record.');
    }
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
      setMessage(response.alreadyExists ? 'Already synced to PostgreSQL.' : 'Synced to PostgreSQL successfully.');
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to sync LOA to PostgreSQL.');
    } finally {
      setSyncingIds((current) => ({ ...current, [record._id]: false }));
    }
  };

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
          <button className="button primary" type="submit">
            <Search size={18} />
            Search
          </button>
        </form>

        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>LOA No</th>
                <th>Tender No</th>
                <th>Contractor Name</th>
                <th>Date</th>
                <th>Contract Value</th>
                <th>PostgreSQL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="state-cell">
                    <Loader2 className="spin" size={18} />
                    Loading records
                  </td>
                </tr>
              ) : records.length ? (
                records.map((record) => (
                  <tr key={record._id}>
                    <td className="strong-cell">{record.loa_no}</td>
                    <td>{record.tender_no || '-'}</td>
                    <td>{record.contractor_name || '-'}</td>
                    <td>{record.letter_date || '-'}</td>
                    <td>{formatCurrency(record.contract_value)}</td>
                    <td>
                      <span className={`status-badge ${record.postgres_synced ? 'success' : 'muted'}`}>
                        {record.postgres_synced ? <CheckCircle2 size={14} /> : null}
                        {record.postgres_synced ? 'Synced' : 'Not synced'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
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
                        {/* <Link className="icon-button" to={`/loa/${record._id}/edit`} title="Edit">
                          <Edit size={17} />
                        </Link>
                        <button className="icon-button danger" type="button" onClick={() => handleDelete(record)} title="Delete">
                          <Trash2 size={17} />
                        </button> */}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="state-cell">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
