import { MemoryRouter as Router, Routes, Route, Link } from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';
import { SecureWipeDemo } from './components/SecureWipeDemo';

function Hello() {
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
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
        <Route path="/demo" element={<SecureWipeDemo />} />
      </Routes>
    </Router>
  );
}
