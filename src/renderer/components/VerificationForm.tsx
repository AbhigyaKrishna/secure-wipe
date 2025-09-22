import React, { useState } from 'react';
import './AuthComponents.css';

interface VerificationFormProps {
  email: string;
  onVerify: (verificationCode: string) => Promise<void>;
  onResendCode: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function VerificationForm({
  onVerify,
  onResendCode,
  isLoading,
  error,
}: VerificationFormProps): React.ReactElement {
  const [verificationCode, setVerificationCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.trim()) {
      await onVerify(verificationCode.trim());
    }
  };

  // const handleResend = async () => {
  //   await onResendCode();
  // };

  return (
    <div className="auth-container fade-in">
      <div className="auth-card verification-card">
        <div className="auth-header">
          <div className="auth-logo">
            <div className="logo-background success">
              <span className="logo-icon">✓</span>
            </div>
          </div>
          <h1 className="auth-title">Verification Required</h1>
          <p className="auth-subtitle">
            Please enter your verification code to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
            </div>
          )}

          <div className="form-group verification-group">
            <label className="form-label">Verification Code</label>
            <div className="verification-container">
              <input
                type="text"
                className="verification-input"
                style={{
                  width: '450px',
                  height: '12px',
                  minWidth: '450px',
                  maxWidth: '100%',
                  minHeight: '12px',
                }}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter your verification code"
                required
                disabled={isLoading}
              />
              <div className="verification-hint">
                <span className="hint-icon">🔐</span>
                <span className="hint-text">
                  Enter the code you got from the aadhar verificaiton
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className={`auth-button primary ${isLoading ? 'loading' : ''}`}
            disabled={isLoading || !verificationCode.trim()}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <span className="button-icon">✓</span>
                <span>Verify Code</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <div className="footer-divider" />
          <p className="footer-text">
            Need help? Contact{' '}
            <a
              href="https://sih-bu.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default VerificationForm;
