import React, { useState, useEffect, useCallback } from 'react';
import {
  SecureWipeEvent,
  SecureWipeConfig,
  DriveInfo,
  SystemInfo,
} from '../../main/types/secure-wipe';
import { useAuth } from '../contexts/AuthContext';

interface SecureWipeResult {
  success: boolean;
  error?: string;
}

interface DriveListResult {
  success: boolean;
  drives?: DriveInfo[];
  error?: string;
}

interface SystemInfoResult {
  success: boolean;
  systemInfo?: SystemInfo;
  error?: string;
}

interface BinaryCheckResult {
  success: boolean;
  binaryPath?: string;
  platform?: string;
  supportedPlatforms?: string[];
  binaryStatus?: {
    exists: boolean;
    path: string;
    platform: string;
    isExecutable?: boolean;
    error?: string;
  };
  error?: string;
}

interface PrivilegeStatus {
  success: boolean;
  hasPrivileges: boolean;
  needsElevation: boolean;
  currentUser: string;
  isRoot: boolean;
  platform: string;
  method?: string;
  error?: string;
}

export default function SecureWipeDemo(): React.ReactElement {
  const { userEmail, logout } = useAuth();
  
  // Core state
  const [targetPath, setTargetPath] = useState('');
  const [algorithm, setAlgorithm] = useState<'dod5220' | 'gutmann' | 'random' | 'zeros' | 'ones'>('random');
  const [bufferSize, setBufferSize] = useState(1024);
  const [customPasses, setCustomPasses] = useState(3);
  const [useCustomPasses, setUseCustomPasses] = useState(false);
  const [demoSize, setDemoSize] = useState(10);
  const [requestPrivileges, setRequestPrivileges] = useState(false);
  
  // Operation state
  const [isWiping, setIsWiping] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [progress, setProgress] = useState<SecureWipeEvent | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [binaryAnimation, setBinaryAnimation] = useState<string>('');
  
  // System state
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [binaryStatus, setBinaryStatus] = useState<BinaryCheckResult | null>(null);
  const [privilegeStatus, setPrivilegeStatus] = useState<PrivilegeStatus | null>(null);
  const [isCheckingPrivileges, setIsCheckingPrivileges] = useState(false);
  const [elevationDescription, setElevationDescription] = useState('');
  const [supportsGui, setSupportsGui] = useState(false);

  // Load system information
  const loadSystemInfo = useCallback(async () => {
    try {
      const result: SystemInfoResult = await window.electron.secureWipe.getSystemInfo();
      if (result.success && result.systemInfo) {
        setSystemInfo(result.systemInfo);
        setSupportsGui(result.systemInfo.supportsGuiPrompts || false);
        addLog(`✅ System info loaded: ${result.systemInfo.platform} ${result.systemInfo.architecture}`);
      } else {
        addLog(`❌ Failed to load system info: ${result.error}`);
      }
    } catch (error) {
      addLog(`❌ System info error: ${error}`);
    }
  }, []);

  // Load drives
  const loadDrives = useCallback(async () => {
    try {
      const result: DriveListResult = await window.electron.secureWipe.getDriveList();
      if (result.success && result.drives) {
        setDrives(result.drives);
        addLog(`✅ Found ${result.drives.length} drives`);
      } else {
        addLog(`❌ Failed to load drives: ${result.error}`);
      }
    } catch (error) {
      addLog(`❌ Drive list error: ${error}`);
    }
  }, []);

  // Check binary status
  const checkBinaryStatus = useCallback(async () => {
      try {
      const result: BinaryCheckResult = await window.electron.secureWipe.checkBinaryStatus();
        setBinaryStatus(result);
      if (result.success && result.binaryStatus?.exists) {
        addLog(`✅ Binary found: ${result.binaryStatus.path}`);
              } else {
        addLog(`❌ Binary not found: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      addLog(`❌ Binary check error: ${error}`);
    }
  }, []);

  // Check privileges
  const checkPrivileges = useCallback(async (path: string) => {
    if (!path.trim()) return;
    
    setIsCheckingPrivileges(true);
    try {
      const result: PrivilegeStatus = await window.electron.secureWipe.checkPrivileges(path);
      setPrivilegeStatus(result);
      
      if (result.success) {
        addLog(`✅ Privilege check completed for: ${path}`);
        if (result.needsElevation && supportsGui) {
          try {
            const descResult = await window.electron.secureWipe.getElevationDescription(path);
            if (descResult.success && descResult.description) {
              setElevationDescription(descResult.description);
            }
          } catch (error) {
            addLog(`Failed to get elevation description: ${error}`);
          }
        } else {
          setElevationDescription('');
        }
      } else {
        addLog(`❌ Privilege check failed: ${result.error}`);
      }
    } catch (error) {
      addLog(`❌ Privilege check error: ${error}`);
      setPrivilegeStatus(null);
    } finally {
      setIsCheckingPrivileges(false);
    }
  }, [supportsGui]);

  // Initialize system
  useEffect(() => {
    loadSystemInfo();
    loadDrives();
    checkBinaryStatus();
  }, [loadSystemInfo, loadDrives, checkBinaryStatus]);

  // Binary animation
  const generateBinaryAnimation = useCallback(() => {
    if (!isWiping) {
      setBinaryAnimation('');
      return;
    }

    const animateBinary = () => {
      const length = 64;
      const binary = Array.from({ length }, () =>
        Math.random() > 0.5 ? '1' : '0'
      ).join('');
      setBinaryAnimation(binary);
    };

    const interval = setInterval(animateBinary, 100);
    return () => clearInterval(interval);
  }, [isWiping]);

  useEffect(() => {
    const cleanup = generateBinaryAnimation();
    return cleanup;
  }, [generateBinaryAnimation]);

  // Logging
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };


  // Operations
  const handleStartDemo = async () => {
    setIsWiping(true);
    setProgress(null);
    addLog('🚀 Starting demo wipe...');

    const config: SecureWipeConfig = {
      targetPath: `/tmp/demo-${Date.now()}.tmp`,
      algorithm: 'random',
      bufferSize: demoSize * 1024,
      customPasses: 1,
      useCustomPasses: true,
      demoMode: true,
    };

    try {
      const result: SecureWipeResult = await window.electron.secureWipe.startWipe(config);
      if (!result.success) {
        addLog(`❌ Demo failed: ${result.error}`);
        setIsWiping(false);
      }
    } catch (error) {
      addLog(`❌ Demo error: ${error}`);
      setIsWiping(false);
    }
  };

  const handleStartWipe = async () => {
    if (!targetPath.trim()) {
      addLog('❌ Please select a target path');
      return;
    }

    setIsWiping(true);
    setProgress(null);
    addLog(`🔥 Starting wipe: ${targetPath}`);

    const config: SecureWipeConfig = {
      targetPath,
      algorithm,
      bufferSize,
      customPasses: useCustomPasses ? customPasses : undefined,
      useCustomPasses,
      requestPrivileges,
    };

    try {
      const result: SecureWipeResult = await window.electron.secureWipe.startWipe(config);
      if (!result.success) {
        addLog(`❌ Wipe failed: ${result.error}`);
        setIsWiping(false);
      }
    } catch (error) {
      addLog(`❌ Wipe error: ${error}`);
      setIsWiping(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    addLog('⏹️ Cancelling operation...');

    try {
      const result: SecureWipeResult = await window.electron.secureWipe.cancelWipe();
      if (result.success) {
        addLog('✅ Operation cancelled');
      setIsWiping(false);
      setProgress(null);
      } else {
        addLog(`❌ Cancel failed: ${result.error}`);
      }
    } catch (error) {
      addLog(`❌ Cancel error: ${error}`);
    } finally {
      setIsCancelling(false);
    }
  };

  // Progress listener
  useEffect(() => {
    const handleProgress = (event: SecureWipeEvent) => {
      setProgress(event);
      if (event.type === 'complete') {
        setIsWiping(false);
        addLog('✅ Wipe completed successfully');
        setCurrentStep(5); // Go to logs
      } else if (event.type === 'error') {
        setIsWiping(false);
        addLog(`❌ Wipe failed: ${event.message}`);
      } else if (event.type === 'progress') {
        addLog(`📊 Progress: ${event.percentage}% - ${event.message}`);
      }
    };

    window.electron.secureWipe.onProgress(handleProgress);
    return () => {
      window.electron.secureWipe.removeProgressListener();
    };
  }, []);

  // Auto-check privileges when target changes
  useEffect(() => {
    if (targetPath.trim()) {
      checkPrivileges(targetPath);
    }
  }, [targetPath, checkPrivileges]);


  // Neomorphism styles
  const neomorphismStyles = `
    .secure-wipe-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .main-container {
      max-width: 1400px;
      margin: 0 auto;
      background: #f8fafc;
      border-radius: 30px;
      box-shadow: 
        20px 20px 60px #d1d9e6,
        -20px -20px 60px #ffffff;
      overflow: hidden;
    }

    .container-header {
      background: linear-gradient(135deg, #475569 0%, #334155 100%);
      padding: 30px 40px;
      text-align: center;
      color: white;
    }

    .container-title {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 8px 0;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .container-subtitle {
      font-size: 1rem;
      opacity: 0.9;
      margin: 0;
    }

    .main-content {
      padding: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 30px;
      min-height: 600px;
    }

    .left-panel {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .center-panel {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .right-panel {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .neo-card {
      background: #f8fafc;
      border-radius: 20px;
      padding: 25px;
      box-shadow: 
        8px 8px 16px #d1d9e6,
        -8px -8px 16px #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .neo-card-inset {
      background: #f8fafc;
      border-radius: 15px;
      padding: 15px;
      box-shadow: 
        inset 4px 4px 8px #d1d9e6,
        inset -4px -4px 8px #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.05);
    }

    .system-status-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 20px;
    }

    .status-item {
      background: #f8fafc;
      border-radius: 12px;
      padding: 15px;
      text-align: center;
      box-shadow: 
        4px 4px 8px #d1d9e6,
        -4px -4px 8px #ffffff;
    }

    .status-icon {
      font-size: 1.5rem;
      margin-bottom: 8px;
    }

    .status-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
    }

    .status-value {
      font-size: 14px;
      font-weight: 600;
      color: #475569;
    }

    .drive-list {
      max-height: 300px;
      overflow-y: auto;
    }

    .drive-item {
      background: #f8fafc;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 
        2px 2px 4px #d1d9e6,
        -2px -2px 4px #ffffff;
      border: 2px solid transparent;
    }

    .drive-item:hover {
      box-shadow: 
        4px 4px 8px #d1d9e6,
        -4px -4px 8px #ffffff;
    }

    .drive-item.selected {
      border-color: #475569;
      box-shadow: 
        2px 2px 4px #d1d9e6,
        -2px -2px 4px #ffffff,
        0 0 0 2px rgba(71, 85, 105, 0.1);
    }

    .drive-path {
      font-weight: 600;
      color: #475569;
      font-size: 14px;
    }

    .drive-desc {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }

    .neo-button {
      background: #f8fafc;
      border: none;
      border-radius: 12px;
      padding: 12px 24px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 
        4px 4px 8px #d1d9e6,
        -4px -4px 8px #ffffff;
      color: #475569;
      font-size: 14px;
    }

    .neo-button:hover {
      box-shadow: 
        2px 2px 4px #d1d9e6,
        -2px -2px 4px #ffffff;
    }

    .neo-button:active {
      box-shadow: 
        inset 2px 2px 4px #d1d9e6,
        inset -2px -2px 4px #ffffff;
    }

    .neo-button.primary {
      background: linear-gradient(135deg, #475569 0%, #334155 100%);
      color: white;
      box-shadow: 
        4px 4px 8px rgba(71, 85, 105, 0.3),
        -4px -4px 8px rgba(255, 255, 255, 0.8);
    }

    .neo-button.primary:hover {
      box-shadow: 
        6px 6px 12px rgba(71, 85, 105, 0.4),
        -6px -6px 12px rgba(255, 255, 255, 0.9);
    }

    .neo-button.success {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: white;
      box-shadow: 
        4px 4px 8px rgba(5, 150, 105, 0.3),
        -4px -4px 8px rgba(255, 255, 255, 0.8);
    }

    .neo-button.danger {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: white;
      box-shadow: 
        4px 4px 8px rgba(220, 38, 38, 0.3),
        -4px -4px 8px rgba(255, 255, 255, 0.8);
    }

    .neo-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: 
        inset 2px 2px 4px #d1d9e6,
        inset -2px -2px 4px #ffffff;
    }

    .neo-input {
      background: #f8fafc;
      border: none;
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 14px;
      width: 100%;
      box-shadow: 
        inset 4px 4px 8px #d1d9e6,
        inset -4px -4px 8px #ffffff;
      color: #475569;
    }

    .neo-input:focus {
      outline: none;
      box-shadow: 
        inset 4px 4px 8px #d1d9e6,
        inset -4px -4px 8px #ffffff,
        0 0 0 3px rgba(71, 85, 105, 0.1);
    }

    .neo-select {
      background: #f8fafc;
      border: none;
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 14px;
      width: 100%;
      box-shadow: 
        inset 4px 4px 8px #d1d9e6,
        inset -4px -4px 8px #ffffff;
      color: #475569;
      cursor: pointer;
    }

    .binary-animation {
      font-family: 'Courier New', monospace;
      font-size: 10px;
      line-height: 1.2;
      background: #1a1a1a;
      color: #00ff00;
      padding: 15px;
      border-radius: 10px;
      overflow-x: auto;
      white-space: nowrap;
      margin: 15px 0;
      box-shadow: 
        inset 4px 4px 8px rgba(0, 0, 0, 0.3),
        inset -4px -4px 8px rgba(255, 255, 255, 0.1);
    }

    .progress-container {
      background: #f8fafc;
      border-radius: 15px;
      padding: 20px;
      margin: 15px 0;
      box-shadow: 
        4px 4px 8px #d1d9e6,
        -4px -4px 8px #ffffff;
    }

    .progress-bar {
      background: #f8fafc;
      border-radius: 10px;
      height: 16px;
      overflow: hidden;
      box-shadow: 
        inset 2px 2px 4px #d1d9e6,
        inset -2px -2px 4px #ffffff;
      margin: 15px 0;
    }

    .progress-fill {
      background: linear-gradient(135deg, #475569 0%, #334155 100%);
      height: 100%;
      transition: width 0.3s ease;
      border-radius: 10px;
    }

    .log-container {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 15px;
      height: 300px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #00ff00;
      box-shadow: 
        inset 4px 4px 8px rgba(0, 0, 0, 0.3),
        inset -4px -4px 8px rgba(255, 255, 255, 0.1);
    }

    .log-entry {
      margin-bottom: 3px;
      word-wrap: break-word;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #475569;
      margin: 0 0 15px 0;
    }

    @media (max-width: 1200px) {
      .main-content {
        grid-template-columns: 1fr 1fr;
      }
      .right-panel {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 768px) {
      .main-content {
        grid-template-columns: 1fr;
      }
      
      .main-container {
        margin: 10px;
        border-radius: 20px;
      }
      
      .container-header {
        padding: 20px;
      }
      
      .container-title {
        font-size: 1.5rem;
      }
    }

  `;

  // Inject styles
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('neomorphism-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'neomorphism-styles';
      styleElement.textContent = neomorphismStyles;
      document.head.appendChild(styleElement);
    }
  }, []);

  return (
    <div className="secure-wipe-container">
      <div className="main-container">
        <div className="container-header">
          <h1 className="container-title">Secure Wipe</h1>
          <p className="container-subtitle">Professional data erasure with privilege escalation</p>
      </div>

        <div className="main-content">
          {/* Left Panel - System Status */}
          <div className="left-panel">
            <div className="neo-card">
              <h3 className="section-title">System Status</h3>
              <div className="system-status-grid">
                <div className="status-item">
                  <div className="status-icon">💻</div>
                  <div className="status-label">Platform</div>
                  <div className="status-value">
                    {systemInfo?.platform || 'Loading...'}
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-icon">🔧</div>
                  <div className="status-label">Binary</div>
                  <div className={`status-value ${binaryStatus?.binaryStatus?.exists ? '' : 'error'}`}>
                    {binaryStatus?.binaryStatus?.exists ? '✅ Ready' : '❌ Not Found'}
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-icon">💾</div>
                  <div className="status-label">Drives</div>
                  <div className="status-value">{drives.length}</div>
                </div>
                <div className="status-item">
                  <div className="status-icon">👤</div>
                  <div className="status-label">User</div>
                  <div className="status-value">
                    {systemInfo?.currentUser || 'Unknown'}
                  </div>
                </div>
              </div>
      </div>

            <div className="neo-card">
              <h3 className="section-title">Target Selection</h3>
              <div className="neo-card-inset" style={{ marginBottom: '15px' }}>
            <input
              type="text"
                  className="neo-input"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="/path/to/file or /dev/device"
              disabled={isWiping}
            />
              </div>
              
              <div className="drive-list">
                {drives.map((drive, index) => (
                  <div
                    key={index}
                    className={`drive-item ${targetPath === drive.path ? 'selected' : ''}`}
                    onClick={() => setTargetPath(drive.path)}
                  >
                    <div className="drive-path">{drive.path}</div>
                    <div className="drive-desc">{drive.description}</div>
                  </div>
                ))}
              </div>
            </div>
        </div>

          {/* Center Panel - Configuration */}
          <div className="center-panel">
            <div className="neo-card">
              <h3 className="section-title">Algorithm</h3>
            <select
                className="neo-select"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as any)}
              disabled={isWiping}
            >
              <option value="random">Random (1 pass)</option>
                <option value="dod5220">DoD 5220 (3 passes)</option>
                <option value="gutmann">Gutmann (35 passes)</option>
              <option value="zeros">Zeros (1 pass)</option>
              <option value="ones">Ones (1 pass)</option>
            </select>
            </div>

            <div className="neo-card">
              <h3 className="section-title">Settings</h3>
              <div className="neo-card-inset" style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                  Buffer Size (KB)
                </label>
                <input
                  type="number"
                  className="neo-input"
                  value={bufferSize}
                  onChange={(e) => setBufferSize(parseInt(e.target.value) || 1024)}
                  min="1"
                  max="10240"
                />
              </div>
              <div className="neo-card-inset">
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                  Demo Size (MB)
          </label>
                <input
                  type="number"
                  className="neo-input"
                  value={demoSize}
                  onChange={(e) => setDemoSize(parseInt(e.target.value) || 10)}
                  min="1"
                  max="100"
                />
        </div>
      </div>

            {privilegeStatus?.needsElevation && (
              <div className="neo-card">
                <h3 className="section-title">Privileges</h3>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    id="requestPrivileges"
                    checked={requestPrivileges}
                    onChange={(e) => setRequestPrivileges(e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  <label htmlFor="requestPrivileges" style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                    Auto-request admin privileges
                  </label>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                  Automatically request administrator privileges when needed.
                </div>
              </div>
            )}

            <div className="neo-card">
              <h3 className="section-title">Actions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
                  className="neo-button success" 
          onClick={handleStartDemo}
                  disabled={!binaryStatus?.binaryStatus?.exists || isWiping}
        >
                  🛡️ Safe Demo ({demoSize}MB)
        </button>
        <button
                  className="neo-button primary" 
          onClick={handleStartWipe}
                  disabled={!targetPath || !binaryStatus?.binaryStatus?.exists || isWiping}
        >
                  🔥 Start Secure Wipe
        </button>
                {isWiping && (
                  <button 
                    className="neo-button danger" 
                    onClick={handleCancel}
                    disabled={isCancelling}
                  >
                    {isCancelling ? '⏳ Cancelling...' : '⏹️ Cancel'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Progress & Logs */}
          <div className="right-panel">
            {isWiping && (
              <div className="neo-card">
                <h3 className="section-title">Progress</h3>
                <div className="progress-container">
                  <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '5px', color: '#475569' }}>
                      🔥 Wiping in Progress
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Using {algorithm.toUpperCase()} algorithm
                    </div>
                  </div>
                  
                  {progress && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress.percentage || 0}%` }}
                      ></div>
            </div>
          )}
                  
                  <div className="binary-animation">
                    {binaryAnimation || '0101010101010101010101010101010101010101010101010101010101010101'}
                  </div>
                </div>
        </div>
      )}

            <div className="neo-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 className="section-title" style={{ margin: 0 }}>Activity Log</h3>
                <button 
                  className="neo-button" 
                  onClick={() => setLogs([])}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  🗑️ Clear
                </button>
              </div>
              
              <div className="log-container">
                {logs.length === 0 ? (
                  <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: '11px' }}>
                    No activity yet. Start a wipe operation to see logs here.
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="log-entry">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
