import React from 'react';
import { MemoryRouter as Router, Routes, Route, Link } from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';
import SecureWipeDemo from './components/SecureWipeDemo';
import LoginForm from './components/LoginForm';
import VerificationForm from './components/VerificationForm';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function Hello() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="app-container fade-in">
      <div className="app-header">
        <img className="app-logo" alt="Secure Wipe" src={icon} />
        <h1 className="app-title">Secure Wipe</h1>
        <p className="app-subtitle">
          Professional data sanitization and secure file wiping tool
        </p>
      </div>
      <div className="nav-buttons">
        <Link to="/demo">
          <button type="button" className="primary nav-button">
            <span role="img" aria-label="demo">
              🔧
            </span>
            Open Demo
          </button>
        </Link>
        <a
          href="https://github.com/AbhigyaKrishna/secure-wipe"
          target="_blank"
          rel="noreferrer"
        >
          <button type="button" className="nav-button">
            <span role="img" aria-label="books">
              📚
            </span>
            View Project
          </button>
        </a>
        {isAuthenticated && (
          <button type="button" className="danger nav-button" onClick={logout}>
            <span role="img" aria-label="logout">
              🚪
            </span>
            Logout
          </button>
        )}
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated,
    needsVerification,
    userEmail,
    login,
    verifyCode,
    resendCode,
    isLoading,
    error,
  } = useAuth();

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} isLoading={isLoading} error={error} />;
  }

  if (needsVerification) {
    return (
      <VerificationForm
        email={userEmail || ''}
        onVerify={verifyCode}
        onResendCode={resendCode}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Hello />
              </ProtectedRoute>
            }
          />
          <Route
            path="/demo"
            element={
              <ProtectedRoute>
                <SecureWipeDemo />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
