import { AlertCircle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadLoaFile } from '../api/loaApi.js';

const isHtmlFile = (file) => /\.(html|htm)$/i.test(file.name);

const UploadLoaPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploadedRecord, setUploadedRecord] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setMessage(null);
    setUploadedRecord(null);

    if (selectedFile && !isHtmlFile(selectedFile)) {
      setFile(null);
      setMessage({ type: 'error', text: 'Only .html and .htm files are allowed.' });
      event.target.value = '';
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      setMessage({ type: 'error', text: 'Please select an HTML file.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      setUploadedRecord(null);
      const result = await uploadLoaFile(file);
      setUploadedRecord(result.data);
      setMessage({
        type: 'success',
        text: result.action === 'updated' ? 'Existing LOA record updated.' : 'LOA record uploaded.'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Upload failed. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Upload LOA</p>
          <h2>Parse IREPS HTML</h2>
        </div>
      </div>

      <form className="panel upload-panel" onSubmit={handleSubmit}>
        <label className="file-drop">
          <FileUp size={32} />
          <span>{file ? file.name : 'Choose LOA HTML file'}</span>
          <input type="file" accept=".html,.htm,text/html" onChange={handleFileChange} />
        </label>

        <button type="submit" className="button primary" disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <FileUp size={18} />}
          {loading ? 'Uploading' : 'Upload'}
        </button>
      </form>

      {message && (
        <div className={`notice ${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {uploadedRecord && (
        <div className="panel summary-panel">
          <div className="summary-header">
            <div>
              <p className="eyebrow">Extracted Summary</p>
              <h3>{uploadedRecord.loa_no}</h3>
            </div>
            <Link className="button secondary" to={`/loa/${uploadedRecord._id}`}>
              View
            </Link>
          </div>

          <dl className="summary-grid">
            <div>
              <dt>Letter No</dt>
              <dd>{uploadedRecord.letter_no_full || '-'}</dd>
            </div>
            <div>
              <dt>Tender No</dt>
              <dd>{uploadedRecord.tender_no || '-'}</dd>
            </div>
            <div>
              <dt>Contractor</dt>
              <dd>{uploadedRecord.contractor_name || '-'}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{uploadedRecord.letter_date || '-'}</dd>
            </div>
            <div>
              <dt>Contract Value</dt>
              <dd>{uploadedRecord.contract_value ?? '-'}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
};

export default UploadLoaPage;
