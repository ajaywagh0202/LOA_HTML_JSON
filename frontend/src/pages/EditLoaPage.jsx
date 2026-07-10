import { Loader2, Save } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLoaById, updateLoa } from '../api/loaApi.js';

const initialForm = {
  loa_no: '',
  letter_no_full: '',
  tender_no: '',
  bid_id: '',
  contractor_name: '',
  letter_date: '',
  contract_value: '',
  json_data: '{}'
};

const EditLoaPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadRecord = async () => {
      try {
        setLoading(true);
        const response = await getLoaById(id);
        const record = response.data;
        setForm({
          loa_no: record.loa_no || '',
          letter_no_full: record.letter_no_full || '',
          tender_no: record.tender_no || '',
          bid_id: record.bid_id || '',
          contractor_name: record.contractor_name || '',
          letter_date: record.letter_date || '',
          contract_value: record.contract_value ?? '',
          json_data: JSON.stringify(record.json_data || {}, null, 2)
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Unable to load LOA record.');
      } finally {
        setLoading(false);
      }
    };

    loadRecord();
  }, [id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    let parsedJson;
    try {
      parsedJson = JSON.parse(form.json_data);
    } catch {
      setError('json_data must be valid JSON.');
      return;
    }

    try {
      setSaving(true);
      await updateLoa(id, {
        loa_no: form.loa_no.trim(),
        letter_no_full: form.letter_no_full.trim(),
        tender_no: form.tender_no.trim(),
        bid_id: form.bid_id.trim(),
        contractor_name: form.contractor_name.trim(),
        letter_date: form.letter_date.trim(),
        contract_value: form.contract_value === '' ? null : Number(form.contract_value),
        json_data: parsedJson
      });
      navigate(`/loa/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update LOA record.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="state-page">
        <Loader2 className="spin" size={22} />
        Loading editor
      </div>
    );
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Edit LOA</p>
          <h2>{form.loa_no}</h2>
        </div>
      </div>

      <form className="panel edit-form" onSubmit={handleSubmit}>
        {error && <div className="notice error">{error}</div>}

        <div className="form-grid">
          <label>
            <span>LOA No</span>
            <input name="loa_no" value={form.loa_no} onChange={handleChange} required />
          </label>
          <label>
            <span>Letter Date</span>
            <input name="letter_date" value={form.letter_date} onChange={handleChange} />
          </label>
          <label className="wide">
            <span>Letter No Full</span>
            <input name="letter_no_full" value={form.letter_no_full} onChange={handleChange} />
          </label>
          <label>
            <span>Tender No</span>
            <input name="tender_no" value={form.tender_no} onChange={handleChange} />
          </label>
          <label>
            <span>Bid ID</span>
            <input name="bid_id" value={form.bid_id} onChange={handleChange} />
          </label>
          <label>
            <span>Contractor Name</span>
            <input name="contractor_name" value={form.contractor_name} onChange={handleChange} />
          </label>
          <label>
            <span>Contract Value</span>
            <input name="contract_value" type="number" value={form.contract_value} onChange={handleChange} />
          </label>
          <label className="wide">
            <span>json_data</span>
            <textarea name="json_data" value={form.json_data} onChange={handleChange} rows={18} />
          </label>
        </div>

        <div className="form-actions">
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default EditLoaPage;
