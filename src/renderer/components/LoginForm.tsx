import React, { useState } from 'react';
import './AuthComponents.css';

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin, isLoading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim()) {
      await onLogin(email.trim(), password.trim());
    }
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <div className="logo-background">
              <span className="logo-icon">🛡️</span>
            </div>
          </div>
          <h1 className="auth-title">Welcome to SecureWipe</h1>
          <p className="auth-subtitle">
            Sign in to access enterprise-grade data sanitization tools
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-container">
              <span className="input-icon">📧</span>
              <input
                type="email"
                className="form-input with-icon"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-container">
              <span className="input-icon">🔒</span>
              <input
                type="password"
                className="form-input with-icon"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <button
            type="submit"
            className={`auth-button primary ${isLoading ? 'loading' : ''}`}
            disabled={isLoading || !email.trim() || !password.trim()}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span className="button-icon">→</span>
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <div className="footer-divider"></div>
          <p className="footer-text">
            Secure authentication powered by{' '}
            <a 
              href="https://sih-bu.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="footer-link"
            >
              SecureWipe Cloud
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
