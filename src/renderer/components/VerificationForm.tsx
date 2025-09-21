import React, { useState } from 'react';
import './AuthComponents.css';

interface VerificationFormProps {
  email: string;
  onVerify: (verificationCode: string) => Promise<void>;
  onResendCode: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const VerificationForm: React.FC<VerificationFormProps> = ({ 
  email, 
  onVerify, 
  onResendCode, 
  isLoading, 
  error 
}) => {
  const [verificationCode, setVerificationCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.trim()) {
      await onVerify(verificationCode.trim());
    }
  };

  const handleResend = async () => {
    await onResendCode();
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <span className="logo-icon">✅</span>
          </div>
          <h1 className="auth-title">Verification</h1>
          <p className="auth-subtitle">
            Enter your verification code
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Verification Code</label>
            <input
              type="text"
              className="form-input verification-input"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter your verification code"
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className={`auth-button success ${isLoading ? 'loading' : ''}`}
            disabled={isLoading || !verificationCode.trim()}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                Verifying...
              </>
            ) : (
              <>
                <span className="button-icon">🔍</span>
                Verify Code
              </>
            )}
          </button>
        </form>


      </div>
    </div>
  );
};
