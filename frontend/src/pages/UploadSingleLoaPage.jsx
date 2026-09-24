import { AlertCircle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getUnits, uploadSingleLoaFile } from '../api/loaApi.js';
import LoaRestrictionEditor from '../components/LoaRestrictionEditor.jsx';

const isHtmlFile = (file) => /\.(html|htm)$/i.test(file.name);



const UploadSingleLoaPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingRestrictions, setSavingRestrictions] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploadedRecord, setUploadedRecord] = useState(null);
  const [restricted, setRestricted] = useState('No');
  const [location, setLocation] = useState('');
  const [unit, setUnit] = useState('');
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setUnitsLoading(true);
    setUnitsError('');
    getUnits().then((result) => {
      if (!active) return;
      if (!Array.isArray(result.data)) throw new Error('Invalid units response');
      setUnits(result.data);
      if (!result.data.length) setUnitsError('No units available. Please retry later.');
    }).catch((error) => {
      if (active) setUnitsError(error.response?.data?.message || 'Unable to load units. Please retry.');
    }).finally(() => { if (active) setUnitsLoading(false); });
    return () => { active = false; };
  }, [attempt]);

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

    if (loading) return;
    if (!file || !location.trim() || !unit || unitsLoading || unitsError) {
      setMessage({ type: 'error', text: 'Please select an HTML file and complete all required fields.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      setUploadedRecord(null);
      const result = await uploadSingleLoaFile(file, restricted, location.trim(), unit);
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
    <section className="page-stack single-loa-page">
      <div className="page-heading">
        <div>
          <h2>IREPS LOA upload</h2>
        </div>
      </div>

      <form className="panel single-loa-form" onSubmit={handleSubmit} aria-busy={loading}>
        <p className="single-loa-hint">Enter the LOA details and choose one HTML file. All fields are required.</p>
        <fieldset disabled={loading || savingRestrictions} onChange={() => { setMessage(null); setUploadedRecord(null); }}>
          <legend>LOA details</legend>
          <div className="single-loa-fields">
            <label htmlFor="loa-restricted">Whether LOA is restricted *</label>
            <select id="loa-restricted" name="loa_restricted" required value={restricted} onChange={(event) => setRestricted(event.target.value)}>
              <option value="No">No</option><option value="Yes">Yes</option>
            </select>
            <label htmlFor="loa-location">Section / Location *</label>
            <input id="loa-location" name="location" required placeholder="Enter section or location" value={location} onChange={(event) => setLocation(event.target.value)} />
            <label htmlFor="loa-unit">Division / Unit *</label>
            <select id="loa-unit" name="unit" required disabled={unitsLoading || !!unitsError} value={unit} onChange={(event) => setUnit(event.target.value)}>
              <option value="">{unitsLoading ? 'Loading units...' : 'Select division / unit'}</option>
              {units.map((item) => <option key={item.divcode} value={item.divcode}>{item.divname} ({item.divcode})</option>)}
            </select>
          </div>
        </fieldset>
        {unitsError && <div className="notice error" role="alert"><AlertCircle size={18} /><span>{unitsError}</span><button type="button" className="button secondary" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>}
        <label className="single-loa-file">
          <FileUp size={32} />
          <span>{file ? file.name : 'Choose LOA HTML file'}</span>
          <input required disabled={loading || savingRestrictions} name="file" type="file" accept=".html,.htm,text/html" onChange={handleFileChange} />
        </label>

        <button type="submit" className="button primary" disabled={loading || savingRestrictions || unitsLoading || !!unitsError || !file || !location.trim() || !unit}>
          {loading ? <Loader2 className="spin" size={18} /> : <FileUp size={18} />}
          {loading ? 'Uploading...' : 'Upload LOA'}
        </button>
      </form>

      {message && (
        <div className={`notice ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {uploadedRecord && <LoaRestrictionEditor key={uploadedRecord._id} record={uploadedRecord} onSavingChange={setSavingRestrictions} />}

    </section>
  );
};

export default UploadSingleLoaPage;
