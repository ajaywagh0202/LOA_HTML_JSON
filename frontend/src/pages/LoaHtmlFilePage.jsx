import { ArrowLeft, FileCode2, FileWarning, Loader2, Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLoaHtmlFile } from '../api/loaApi.js';

const LoaHtmlFilePage = () => {
  const { loaNo } = useParams();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadHtmlFile = async () => {
      try {
        setLoading(true);
        setError('');
        const sourceHtml = await getLoaHtmlFile(loaNo);
        if (active) {
          setHtml(sourceHtml);
        }
      } catch (loadError) {
        if (active) {
          const isMissing = loadError.response?.status === 404;
          setError(
            isMissing
              ? 'The source HTML file is not available for this LOA. Re-upload the LOA HTML file to save it.'
              : 'Unable to load the source HTML file. Please try again.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadHtmlFile();
    return () => {
      active = false;
    };
  }, [loaNo]);

  return (
    <section className="page-stack loa-file-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Saved HTML File</p>
          <h2>LOA {loaNo}</h2>
        </div>
        <Link className="button secondary" to="/loa">
          <ArrowLeft size={18} />
          Back to Records
        </Link>
      </div>

      {loading ? (
        <div className="panel state-page">
          <Loader2 className="spin" size={22} />
          Loading saved HTML file
        </div>
      ) : error ? (
        <div className="panel missing-html-state">
          <span className="missing-html-icon">
            <FileWarning size={34} />
          </span>
          <div>
            <h3>HTML file not available</h3>
            <p>{error}</p>
          </div>
          <div className="missing-html-actions">
            <Link className="button primary" to="/upload">
              <Upload size={18} />
              Re-upload LOA
            </Link>
            <Link className="button secondary" to="/loa">
              <ArrowLeft size={18} />
              Back to Records
            </Link>
          </div>
        </div>
      ) : (
        <div className="panel html-viewer-panel">
          <div className="section-title">
            <h3>
              <FileCode2 size={19} />
              Source HTML Preview
            </h3>
            <span className="status-badge success">File loaded</span>
          </div>
          <iframe
            className="loa-html-frame"
            title={`Saved HTML for LOA ${loaNo}`}
            srcDoc={html}
            sandbox=""
          />
        </div>
      )}
    </section>
  );
};

export default LoaHtmlFilePage;
