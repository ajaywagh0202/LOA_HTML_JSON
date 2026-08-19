import { Check, Copy, Edit, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import JsonView from '@uiw/react-json-view';
import { githubDarkTheme } from '@uiw/react-json-view/githubDark';
import { getLoaById } from '../api/loaApi.js';

const formatJson = (value) => JSON.stringify(value || {}, null, 2);

const LoaDetailsPage = () => {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    const loadRecord = async () => {
      try {
        setLoading(true);
        const response = await getLoaById(id);
        setRecord(response.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Unable to load LOA record.');
      } finally {
        setLoading(false);
      }
    };

    loadRecord();
  }, [id]);

  const handleCopyJson = async () => {
    const jsonText = formatJson(record?.json_data);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = jsonText;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus(''), 1800);
    } catch (err) {
      setCopyStatus('failed');
      window.setTimeout(() => setCopyStatus(''), 2200);
    }
  };

  if (loading) {
    return (
      <div className="state-page">
        <Loader2 className="spin" size={22} />
        Loading LOA
      </div>
    );
  }

  if (error) {
    return <div className="notice error">{error}</div>;
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOA Details</p>
          <h2>{record.loa_no}</h2>
        </div>
        {/* <Link className="button primary" to={`/loa/${record._id}/edit`}>
          <Edit size={18} />
          Edit
        </Link> */}
      </div>

      <div className="panel summary-panel">
        <dl className="summary-grid">
          <div>
            <dt>Letter No</dt>
            <dd>{record.letter_no_full || '-'}</dd>
          </div>
          <div>
            <dt>Tender No</dt>
            <dd>{record.tender_no || '-'}</dd>
          </div>
          <div>
            <dt>Bid ID</dt>
            <dd>{record.bid_id || '-'}</dd>
          </div>
          <div>
            <dt>Contractor</dt>
            <dd>{record.contractor_name || '-'}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{record.letter_date || '-'}</dd>
          </div>
          <div>
            <dt>Contract Value</dt>
            <dd>{record.contract_value ?? '-'}</dd>
          </div>
          <div>
            <dt>Original File</dt>
            <dd>{record.original_file_name || '-'}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '-'}</dd>
          </div>
        </dl>
      </div>

      <div className="panel json-panel">
        <div className="section-title">
          <h3>Extracted JSON</h3>
          <button className="button secondary copy-json-button" type="button" onClick={handleCopyJson}>
            {copyStatus === 'copied' ? <Check size={17} /> : <Copy size={17} />}
            {copyStatus === 'copied' ? 'Copied' : 'Copy JSON'}
          </button>
        </div>
        {copyStatus === 'failed' && (
          <div className="inline-error">Copy failed. Select the JSON text and press Ctrl+C.</div>
        )}
        <div className="json-viewer-wrap">
          <JsonView
            value={record.json_data || {}}
            style={githubDarkTheme}
            collapsed={2}
            displayDataTypes={false}
            displayObjectSize
            enableClipboard
            shortenTextAfterLength={120}
          />
        </div>
      </div>
    </section>
  );
};

export default LoaDetailsPage;
