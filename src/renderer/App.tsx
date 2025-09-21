import { MemoryRouter as Router, Routes, Route, Link } from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';
import { SecureWipeDemo } from './components/SecureWipeDemo';

function Hello() {
  return (
    <div>
      <div className="Hello">
        <img width="200" alt="icon" src={icon} />
      </div>
      <h1>Secure Wipe</h1>
      <div className="Hello">
        <Link to="/demo">
          <button type="button">
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
          <button type="button">
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
