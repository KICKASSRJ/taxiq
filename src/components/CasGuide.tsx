import React, { useState } from 'react';

type Source = 'mfcentral' | 'cams';

export function CasGuide() {
  const [source, setSource] = useState<Source>('mfcentral');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="cas-guide">
      <div className="cas-guide-header" onClick={() => setExpanded(!expanded)}>
        <h3>📥 Don't have a CAS? Get it in 2 minutes</h3>
        <span className="cas-guide-toggle">{expanded ? '▲ Hide' : '▼ Show steps'}</span>
      </div>

      {expanded && (
        <div className="cas-guide-body">
          <p className="cas-guide-intro">
            A <strong>CAS (Consolidated Account Statement)</strong> contains all your mutual fund holdings.
            Download it from either source below — both cover CAMS + KFintech funds.
          </p>

          <div className="cas-source-tabs">
            <button
              className={`cas-source-tab ${source === 'mfcentral' ? 'active' : ''}`}
              onClick={() => setSource('mfcentral')}
            >
              MFCentral <span className="cas-tab-badge">Recommended</span>
            </button>
            <button
              className={`cas-source-tab ${source === 'cams' ? 'active' : ''}`}
              onClick={() => setSource('cams')}
            >
              CAMS Online
            </button>
          </div>

          {source === 'mfcentral' ? (
            <div className="cas-steps">
              <div className="cas-step">
                <span className="cas-step-num">1</span>
                <div>
                  <strong>Sign in to MFCentral</strong>
                  <p>
                    Go to{' '}
                    <a href="https://app.mfcentral.com/investor/signin" target="_blank" rel="noopener noreferrer">
                      app.mfcentral.com
                    </a>{' '}
                    and log in with your <strong>PAN + mobile OTP</strong>.
                    <br />
                    <span className="cas-step-note">New user? <a href="https://app.mfcentral.com/investor/signup" target="_blank" rel="noopener noreferrer">Sign up here</a> — it's free and instant.</span>
                  </p>
                </div>
              </div>
              <div className="cas-step">
                <span className="cas-step-num">2</span>
                <div>
                  <strong>Navigate to CAS</strong>
                  <p>Go to <strong>Reports → CAS</strong> (Consolidated Account Statement).</p>
                </div>
              </div>
              <div className="cas-step">
                <span className="cas-step-num">3</span>
                <div>
                  <strong>Select these options</strong>
                  <ul className="cas-checklist">
                    <li>Statement Type: <strong>Detailed</strong></li>
                    <li>Period: <strong>Specific Period</strong> → Jan 1 to Dec 31 of the tax year</li>
                    <li>Folio Listing: <strong>With Zero Balance Folios</strong></li>
                  </ul>
                </div>
              </div>
              <div className="cas-step">
                <span className="cas-step-num">4</span>
                <div>
                  <strong>Submit & download</strong>
                  <p>
                    The CAS PDF will be emailed to your registered email. Download it and upload here.
                  </p>
                  <p className="cas-step-note">
                    Password is usually: first 5 letters of your email (lowercase) + your date of birth in DDMMYYYY format.
                  </p>
                </div>
              </div>
              <a
                href="https://app.mfcentral.com/investor/signin"
                target="_blank"
                rel="noopener noreferrer"
                className="cas-cta-btn"
              >
                Open MFCentral →
              </a>
            </div>
          ) : (
            <div className="cas-steps">
              <div className="cas-step">
                <span className="cas-step-num">1</span>
                <div>
                  <strong>Go to CAMS Online</strong>
                  <p>
                    Visit{' '}
                    <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" target="_blank" rel="noopener noreferrer">
                      CAMS CAS page
                    </a>{' '}
                    and accept the disclaimer.
                  </p>
                </div>
              </div>
              <div className="cas-step">
                <span className="cas-step-num">2</span>
                <div>
                  <strong>Select statement type</strong>
                  <ul className="cas-checklist">
                    <li>Statement Type: <strong>CAS - CAMS + KFintech</strong></li>
                    <li>Detailed Statement: <strong>Yes</strong></li>
                    <li>Folio Listing: <strong>With Zero Balance Folios</strong></li>
                  </ul>
                </div>
              </div>
              <div className="cas-step">
                <span className="cas-step-num">3</span>
                <div>
                  <strong>Enter your email</strong>
                  <p>
                    Enter the email address registered with your mutual fund folios. Use the <strong>same email</strong> for the confirm email field.
                  </p>
                </div>
              </div>
              <div className="cas-step">
                <span className="cas-step-num">4</span>
                <div>
                  <strong>Set password & period</strong>
                  <ul className="cas-checklist">
                    <li>Choose a password for the PDF (you'll need it when uploading here)</li>
                    <li>Period: <strong>Jan 1 to Dec 31</strong> of the tax year you're filing for</li>
                  </ul>
                </div>
              </div>
              <div className="cas-step">
                <span className="cas-step-num">5</span>
                <div>
                  <strong>Submit & check email</strong>
                  <p>
                    The CAS PDF will arrive in your inbox within minutes. Download it and upload here.
                  </p>
                </div>
              </div>
              <a
                href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"
                target="_blank"
                rel="noopener noreferrer"
                className="cas-cta-btn"
              >
                Open CAMS Online →
              </a>
            </div>
          )}

          <div className="cas-tip">
            <strong>💡 Tip:</strong> MFCentral is recommended because it covers <em>all</em> mutual funds (both CAMS and KFintech RTAs) in a single statement. The CAMS option also provides combined statements but MFCentral's is more standardized.
          </div>
        </div>
      )}
    </div>
  );
}
