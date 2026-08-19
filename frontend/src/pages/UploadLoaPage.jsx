import { AlertCircle, CheckCircle2, Files, FileUp, Loader2, RotateCcw, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadLoaFile, uploadLoaFilesBulk } from '../api/loaApi.js';

const isHtmlFile = (file) => /\.(html|htm)$/i.test(file.name);
const MAX_BULK_FILES = 150;
const fileKey = (file) => `${file.name}-${file.size}-${file.lastModified}`;

const UploadLoaPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploadedRecord, setUploadedRecord] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkMessage, setBulkMessage] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkDragActive, setBulkDragActive] = useState(false);
  const bulkInputRef = useRef(null);

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

  const addBulkFiles = (incomingFiles) => {
    const incoming = Array.from(incomingFiles || []);
    const validFiles = incoming.filter(isHtmlFile);
    const rejectedCount = incoming.length - validFiles.length;
    const existingKeys = new Set(bulkFiles.map(fileKey));
    const uniqueFiles = validFiles.filter((candidate) => {
      const key = fileKey(candidate);
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });
    const availableSlots = Math.max(MAX_BULK_FILES - bulkFiles.length, 0);
    const acceptedFiles = uniqueFiles.slice(0, availableSlots);
    const overLimitCount = uniqueFiles.length - acceptedFiles.length;

    setBulkFiles((current) => [...current, ...acceptedFiles]);
    setBulkResult(null);

    if (rejectedCount || overLimitCount) {
      const messages = [];
      if (rejectedCount) {
        messages.push(`${rejectedCount} non-HTML file${rejectedCount === 1 ? '' : 's'} ignored`);
      }
      if (overLimitCount) {
        messages.push(`maximum ${MAX_BULK_FILES} files allowed`);
      }
      setBulkMessage({ type: 'error', text: `${messages.join('. ')}.` });
    } else {
      setBulkMessage(null);
    }
  };

  const handleBulkFileChange = (event) => {
    addBulkFiles(event.target.files);
    event.target.value = '';
  };

  const removeBulkFile = (indexToRemove) => {
    setBulkFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setBulkResult(null);
    setBulkMessage(null);
  };

  const clearBulkFiles = () => {
    setBulkFiles([]);
    setBulkResult(null);
    setBulkMessage(null);
    setBulkProgress(0);
    if (bulkInputRef.current) {
      bulkInputRef.current.value = '';
    }
  };

  const uploadBulkSelection = async (filesToUpload) => {
    if (!filesToUpload.length) {
      setBulkMessage({ type: 'error', text: 'Please select at least one HTML file.' });
      return;
    }

    try {
      setBulkLoading(true);
      setBulkProgress(0);
      setBulkMessage(null);
      setBulkResult(null);

      const result = await uploadLoaFilesBulk(filesToUpload, (progressEvent) => {
        if (progressEvent.total) {
          setBulkProgress(Math.min(Math.round((progressEvent.loaded * 100) / progressEvent.total), 100));
        }
      });

      setBulkProgress(100);
      setBulkResult(result);
      setBulkMessage({
        type: result.failedCount ? 'error' : 'success',
        text: result.failedCount
          ? `Bulk upload completed with ${result.failedCount} failed file${result.failedCount === 1 ? '' : 's'}.`
          : `All ${result.successCount} files uploaded successfully.`
      });
    } catch (error) {
      setBulkMessage({
        type: 'error',
        text: error.response?.data?.message || 'Bulk upload failed. Please try again.'
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSubmit = async (event) => {
    event.preventDefault();
    await uploadBulkSelection(bulkFiles);
  };

  const retryFailedFiles = async () => {
    const failedNames = new Set(
      (bulkResult?.results || []).filter((result) => result.status === 'failed').map((result) => result.fileName)
    );
    const filesToRetry = bulkFiles.filter((selectedFile) => failedNames.has(selectedFile.name));

    if (!filesToRetry.length) {
      setBulkMessage({ type: 'error', text: 'Re-select the failed files before retrying.' });
      return;
    }

    setBulkFiles(filesToRetry);
    await uploadBulkSelection(filesToRetry);
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

      <div className="bulk-upload-section">
        <div className="bulk-upload-heading">
          <div>
            <p className="eyebrow">Bulk Upload</p>
            <h3>Upload Multiple LOA HTML Files</h3>
          </div>
          <span>Up to {MAX_BULK_FILES} files</span>
        </div>

        <form className="panel bulk-upload-panel" onSubmit={handleBulkSubmit}>
          <div className="bulk-upload-controls">
            <label
              className={`file-drop bulk-file-drop ${bulkDragActive ? 'drag-active' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setBulkDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                setBulkDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setBulkDragActive(false);
                addBulkFiles(event.dataTransfer.files);
              }}
            >
              <Files size={34} />
              <span className="bulk-drop-copy">
                <strong>{bulkFiles.length ? `${bulkFiles.length} files selected` : 'Choose multiple LOA HTML files'}</strong>
                <small>Click to browse or drag and drop .html/.htm files here</small>
              </span>
              <input
                ref={bulkInputRef}
                type="file"
                multiple
                accept=".html,.htm,text/html"
                onChange={handleBulkFileChange}
              />
            </label>

            <button type="submit" className="button primary bulk-upload-button" disabled={bulkLoading || !bulkFiles.length}>
              {bulkLoading ? <Loader2 className="spin" size={18} /> : <Files size={18} />}
              {bulkLoading ? 'Uploading All' : 'Upload All'}
            </button>
          </div>

          {bulkFiles.length > 0 && (
            <div className="bulk-selection">
              <div className="bulk-selection-header">
                <strong>{bulkFiles.length} of {MAX_BULK_FILES} files selected</strong>
                <button className="button secondary" type="button" disabled={bulkLoading} onClick={clearBulkFiles}>
                  Clear all
                </button>
              </div>
              <ul className="bulk-file-list">
                {bulkFiles.map((selectedFile, index) => (
                  <li key={`${fileKey(selectedFile)}-${index}`}>
                    <span title={selectedFile.name}>{selectedFile.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${selectedFile.name}`}
                      disabled={bulkLoading}
                      onClick={() => removeBulkFile(index)}
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {bulkLoading && (
            <div className="bulk-progress" aria-live="polite">
              <div className="bulk-progress-copy">
                <span>{bulkProgress < 100 ? 'Uploading files' : 'Processing LOA files'}</span>
                <strong>{bulkProgress}%</strong>
              </div>
              <div className="bulk-progress-track">
                <span style={{ width: `${bulkProgress}%` }} />
              </div>
            </div>
          )}
        </form>

        {bulkMessage && (
          <div className={`notice ${bulkMessage.type}`}>
            {bulkMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {bulkMessage.text}
          </div>
        )}

        {bulkResult && (
          <div className="panel bulk-results-panel">
            <div className="bulk-results-header">
              <div>
                <p className="eyebrow">Upload Results</p>
                <h3>Bulk Upload Summary</h3>
              </div>
              {bulkResult.failedCount > 0 && (
                <button className="button secondary" type="button" disabled={bulkLoading} onClick={retryFailedFiles}>
                  <RotateCcw size={17} />
                  Retry Failed
                </button>
              )}
            </div>

            <div className="bulk-result-counts">
              <div>
                <span>Total</span>
                <strong>{bulkResult.totalFiles}</strong>
              </div>
              <div className="success">
                <span>Succeeded</span>
                <strong>{bulkResult.successCount}</strong>
              </div>
              <div className="failed">
                <span>Failed</span>
                <strong>{bulkResult.failedCount}</strong>
              </div>
            </div>

            <div className="table-wrap">
              <table className="bulk-results-table">
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Status</th>
                    <th>LOA No</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResult.results.map((result, index) => (
                    <tr key={`${result.fileName}-${index}`}>
                      <td>{result.fileName}</td>
                      <td>
                        <span className={`status-badge ${result.status === 'success' ? 'success' : 'failed'}`}>
                          {result.status === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          {result.status}
                        </span>
                      </td>
                      <td>{result.loa_no || '-'}</td>
                      <td>{result.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default UploadLoaPage;
