import { ChevronDown, Loader2, RefreshCw, Search, X } from 'lucide-react';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { getViewLoa, getViewLoaList } from '../api/loaApi.js';

const EMPTY_VALUE = '-';

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const formatNumber = ({ value }) => {
  if (value === undefined || value === null || value === '') {
    return EMPTY_VALUE;
  }

  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(number)
    : String(value);
};

const formatDate = (value) => {
  if (!value) {
    return EMPTY_VALUE;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB');
};

const scheduleColumnDefs = [
  { field: 'schedule_id', headerName: 'Schedule ID', minWidth: 130 },
  { field: 'item_sno', headerName: 'Item SNo', minWidth: 105 },
  { field: 'item_desc', headerName: 'Item Desc', minWidth: 240, wrapText: true, autoHeight: true },
  { field: 'description', headerName: 'Description', minWidth: 280, wrapText: true, autoHeight: true },
  { field: 'item_directory', headerName: 'Item Directory', minWidth: 190, wrapText: true, autoHeight: true },
  {
    field: 'schedule_item_directory',
    headerName: 'Schedule Item Directory',
    minWidth: 220,
    wrapText: true,
    autoHeight: true
  },
  { field: 'record_type', headerName: 'Record Type', minWidth: 130 },
  { field: 'bid_unit', headerName: 'Bid Unit', minWidth: 110 },
  { field: 'advt_value', headerName: 'Advt Value', minWidth: 130, filter: 'agNumberColumnFilter', valueFormatter: formatNumber },
  {
    field: 'bid_rate_or_unit_rate',
    headerName: 'Bid Rate or Unit Rate',
    minWidth: 185,
    filter: 'agNumberColumnFilter',
    valueFormatter: formatNumber
  },
  { field: 'bid_type', headerName: 'Bid Type', minWidth: 120 },
  { field: 'bid_type_text', headerName: 'Bid Type Text', minWidth: 145 },
  { field: 'bid_amount', headerName: 'Bid Amount', minWidth: 135, filter: 'agNumberColumnFilter', valueFormatter: formatNumber },
  {
    field: 'schedule_total',
    headerName: 'Schedule Total',
    minWidth: 150,
    filter: 'agNumberColumnFilter',
    valueFormatter: formatNumber
  }
];

const itemColumnDefs = [
  { field: 'schedule_id', headerName: 'Schedule ID', minWidth: 130 },
  { field: 'parent_awarded_item_id', headerName: 'Parent Awarded Item ID', minWidth: 205 },
  { field: 'parent_awarded_item_sno', headerName: 'Parent Awarded Item SNo', minWidth: 220 },
  {
    field: 'parent_awarded_item_desc',
    headerName: 'Parent Awarded Item Desc',
    minWidth: 280,
    wrapText: true,
    autoHeight: true
  },
  { field: 'item_sno', headerName: 'Item SNo', minWidth: 105 },
  { field: 'item_code', headerName: 'Item Code', minWidth: 120 },
  { field: 'item_desc', headerName: 'Item Desc', minWidth: 260, wrapText: true, autoHeight: true },
  { field: 'qty_unit', headerName: 'Qty Unit', minWidth: 110 },
  { field: 'item_qty', headerName: 'Item Qty', minWidth: 110, filter: 'agNumberColumnFilter', valueFormatter: formatNumber },
  { field: 'unit_rate', headerName: 'Unit Rate', minWidth: 120, filter: 'agNumberColumnFilter', valueFormatter: formatNumber },
  { field: 'amount', headerName: 'Amount', minWidth: 125, filter: 'agNumberColumnFilter', valueFormatter: formatNumber },
  { field: 'advt_value', headerName: 'Advt Value', minWidth: 130, filter: 'agNumberColumnFilter', valueFormatter: formatNumber },
  {
    field: 'bid_rate_or_unit_rate',
    headerName: 'Bid Rate or Unit Rate',
    minWidth: 185,
    filter: 'agNumberColumnFilter',
    valueFormatter: formatNumber
  },
  { field: 'bid_amount', headerName: 'Bid Amount', minWidth: 135, filter: 'agNumberColumnFilter', valueFormatter: formatNumber },
  { field: 'source', headerName: 'Source', minWidth: 140 }
];

const SearchableLoaSelect = ({ disabled, onChange, options, value }) => {
  const selectedOption = options.find((option) => String(option.loa_no) === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.loa_no ? String(selectedOption.loa_no) : '');
  }, [selectedOption?.loa_no]);

  const filteredOptions = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();
    if (!searchTerm || selectedOption?.loa_no === query) {
      return options;
    }

    return options.filter((option) =>
      `${option.loa_no} ${option.work_name || ''}`.toLowerCase().includes(searchTerm)
    );
  }, [options, query, selectedOption?.loa_no]);

  const selectOption = (option) => {
    setQuery(String(option.loa_no));
    setOpen(false);
    onChange(String(option.loa_no));
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && open && filteredOptions.length) {
      event.preventDefault();
      selectOption(filteredOptions[0]);
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="loa-combobox">
      <div className="loa-combobox-input">
        <Search size={17} />
        <input
          id="loa-search-input"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="loa-options"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder="Search LOA number or work name"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              setQuery(selectedOption?.loa_no ? String(selectedOption.loa_no) : '');
            }, 120);
          }}
          onKeyDown={handleKeyDown}
        />
        {query ? (
          <button
            className="combobox-clear"
            type="button"
            aria-label="Clear LOA selection"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery('');
              setOpen(true);
              onChange('');
            }}
          >
            <X size={16} />
          </button>
        ) : (
          <ChevronDown size={17} />
        )}
      </div>

      {open && !disabled && (
        <div className="loa-options" id="loa-options" role="listbox">
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={option.loa_no}
                className="loa-option"
                type="button"
                role="option"
                aria-selected={String(option.loa_no) === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <strong>{option.loa_no}</strong>
                <span>{option.work_name || 'Work name not available'}</span>
              </button>
            ))
          ) : (
            <div className="loa-option-empty">No matching LOA found</div>
          )}
        </div>
      )}
    </div>
  );
};

const ViewLOA = () => {
  const itemGridRef = useRef(null);
  const requestIdRef = useRef(0);
  const [loaOptions, setLoaOptions] = useState([]);
  const [selectedLoaNo, setSelectedLoaNo] = useState('');
  const [details, setDetails] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadOptions = async () => {
      try {
        setListLoading(true);
        const records = await getViewLoaList();
        if (active) {
          setLoaOptions(Array.isArray(records) ? records : []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.message || 'Unable to load the LOA list.');
        }
      } finally {
        if (active) {
          setListLoading(false);
        }
      }
    };

    loadOptions();
    return () => {
      active = false;
    };
  }, []);

  const loadDetails = async (loaNo) => {
    const requestId = ++requestIdRef.current;

    if (!loaNo) {
      setDetails(null);
      setDetailsLoading(false);
      setError('');
      return;
    }

    try {
      setDetailsLoading(true);
      setError('');
      const response = await getViewLoa(loaNo);
      if (requestId === requestIdRef.current) {
        setDetails(response);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setDetails(null);
        setError(loadError.response?.data?.message || 'Unable to load LOA details. Check your network connection.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setDetailsLoading(false);
      }
    }
  };

  const handleSelection = (loaNo) => {
    setSelectedLoaNo(loaNo);
    loadDetails(loaNo);
  };

  const scheduleRows = useMemo(
    () => details?.schedules || [],
    [details?.schedules]
  );

  const itemRows = useMemo(() => details?.items || [], [details?.items]);

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: 'agTextColumnFilter',
      floatingFilter: true,
      resizable: true,
      minWidth: 100
    }),
    []
  );

  const contract = details?.contract;

  return (
    <section className="page-stack view-loa-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Extracted Data</p>
          <h2>View LOA</h2>
        </div>
      </div>

      <div className="panel loa-selector-panel">
        <label htmlFor="loa-search-input">Select LOA Number to view data</label>
        <div>
          <SearchableLoaSelect
            disabled={listLoading}
            options={loaOptions}
            value={selectedLoaNo}
            onChange={handleSelection}
          />
        </div>
        {listLoading && (
          <span className="selector-state">
            <Loader2 className="spin" size={17} />
            Loading LOAs
          </span>
        )}
      </div>

      {error && <div className="notice error">{error}</div>}

      {detailsLoading ? (
        <div className="panel state-page">
          <Loader2 className="spin" size={22} />
          Loading LOA details
        </div>
      ) : !contract ? (
        <div className="panel view-loa-placeholder">
          <Search size={28} />
          <h3>Select an LOA to view its details</h3>
          <p>Schedule and item data will appear here.</p>
        </div>
      ) : (
        <>
          <div className="view-loa-section">
            <h3>LOA Details</h3>
            <div className="panel loa-summary-wrap">
              <div className="table-wrap">
                <table className="loa-summary-table">
                  <thead>
                    <tr>
                      <th>LOA No</th>
                      <th>Tender No</th>
                      <th>Bid ID</th>
                      <th>Tender ID</th>
                      <th>Tender Version</th>
                      <th>Letter Date</th>
                      <th>Work Description</th>
                      <th>Contract Value</th>
                      <th>Work Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{firstValue(contract.loa_no, EMPTY_VALUE)}</td>
                      <td>{firstValue(contract.tender_no, EMPTY_VALUE)}</td>
                      <td>{firstValue(contract.bid_id, EMPTY_VALUE)}</td>
                      <td>{firstValue(contract.tender_id, EMPTY_VALUE)}</td>
                      <td>{firstValue(contract.tender_version, EMPTY_VALUE)}</td>
                      <td>{formatDate(contract.letter_date)}</td>
                      <td>{firstValue(contract.work_description, EMPTY_VALUE)}</td>
                      <td>{formatNumber({ value: contract.contract_value })}</td>
                      <td>{firstValue(contract.work_name, EMPTY_VALUE)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="view-loa-section">
            <h3>Schedule Details</h3>
            <div className="panel grid-panel">
              <div className="view-loa-grid schedule-grid">
                <AgGridReact
                  columnDefs={scheduleColumnDefs}
                  defaultColDef={defaultColDef}
                  rowData={scheduleRows}
                  animateRows={false}
                  pagination
                  paginationPageSize={10}
                  paginationPageSizeSelector={[10, 25, 50]}
                  overlayNoRowsTemplate="No schedule details available"
                />
              </div>
            </div>
          </div>

          <div className="view-loa-section">
            <div className="section-heading-row">
              <h3>Item Details</h3>
              <div className="grid-toolbar">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => itemGridRef.current?.api?.setFilterModel(null)}
                >
                  <X size={16} />
                  Clear Filters
                </button>
                <button className="button secondary" type="button" onClick={() => loadDetails(selectedLoaNo)}>
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="panel grid-panel">
              <div className="view-loa-grid item-grid">
                <AgGridReact
                  ref={itemGridRef}
                  columnDefs={itemColumnDefs}
                  defaultColDef={defaultColDef}
                  rowData={itemRows}
                  animateRows={false}
                  pagination
                  paginationPageSize={25}
                  paginationPageSizeSelector={[25, 50, 100]}
                  overlayNoRowsTemplate="No item details available"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default ViewLOA;
