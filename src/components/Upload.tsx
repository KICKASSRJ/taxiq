import React, { useState, useCallback } from 'react';

interface UploadProps {
  onFileSelected: (file: File, password?: string) => void;
  isLoading: boolean;
  error: string | null;
  needsPassword: boolean;
  statusMessage?: string;
}

export function Upload({ onFileSelected, isLoading, error, needsPassword, statusMessage }: UploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      onFileSelected(file);
    }
  }, [onFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileSelected(file);
    }
  }, [onFileSelected]);

  const handlePasswordSubmit = () => {
    if (selectedFile && password) {
      onFileSelected(selectedFile, password);
    }
  };

  return (
    <div className="upload-section">
      <div className="step-indicator">Step 1 of 3: Upload your CAS</div>

      {needsPassword ? (
        <div className="password-prompt">
          <h3>PDF is password-protected</h3>
          <p>Enter the password (usually: first 4 characters of PAN + DOB in DDMMYYYY format)</p>
          <div className="password-input-group">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="e.g., ABCD01011990"
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
            />
            <button onClick={handlePasswordSubmit} disabled={!password}>
              Unlock & Parse
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`drop-zone ${dragActive ? 'active' : ''} ${isLoading ? 'loading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>{statusMessage || 'Parsing your CAS...'}</p>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                Check the ⚡ Perf panel (bottom-right) for live timing
              </p>
            </div>
          ) : (
            <>
              <div className="drop-icon">📄</div>
              <p className="drop-text">
                Drag & drop your CAS PDF here, or{' '}
                <label className="file-label">
                  browse
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileInput}
                    hidden
                  />
                </label>
              </p>
              <p className="drop-hint">
                Supports CAMS and MFCentral Consolidated Account Statement (Detailed CAS)
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="privacy-notice">
        🔒 Your CAS is processed entirely in your browser and never uploaded to any server.
        We do not retain your financial data.
      </div>

      <details className="guide-section">
        <summary>How to get your CAS from MFCentral</summary>
        <ol>
          <li>Visit <a href="https://www.mfcentral.com" target="_blank" rel="noopener">mfcentral.com</a> and sign in with your PAN + OTP</li>
          <li>Go to <strong>Portfolio → CAS (Consolidated Account Statement)</strong></li>
          <li>Select <strong>"Detailed"</strong> CAS type</li>
          <li>Choose the date range covering the full calendar year you need (e.g., Jan 1 – Dec 31, 2025)</li>
          <li>Download the PDF and upload it here</li>
        </ol>
        <p><em>The Detailed CAS from MFCentral covers both CAMS and KFin (all mutual funds).</em></p>
      </details>
    </div>
  );
}
