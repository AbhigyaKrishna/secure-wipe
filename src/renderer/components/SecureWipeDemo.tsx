/**
 * Example component demonstrating secure-wipe service usage
 * This shows how to use the service from the renderer process
 */

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

export const SecureWipeDemo: React.FC = () => {
  const { userEmail, logout } = useAuth();
  const [targetPath, setTargetPath] = useState('');
  const [algorithm, setAlgorithm] = useState<
    'dod5220' | 'gutmann' | 'random' | 'zeros' | 'ones'
  >('random');
  const [bufferSize, setBufferSize] = useState<number>(1024); // Default 1MB in KB
  const [customPasses, setCustomPasses] = useState<number>(1);
  const [useCustomPasses, setUseCustomPasses] = useState(false);
  const [demoSize, setDemoSize] = useState<number>(10); // Default 10MB
  const [isWiping, setIsWiping] = useState(false);
  const [progress, setProgress] = useState<SecureWipeEvent | null>(null);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [binaryStatus, setBinaryStatus] = useState<BinaryCheckResult | null>(
    null,
  );
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    setLog((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  }, []);

  // Check binary status on component mount
  useEffect(() => {
    const checkBinary = async () => {
      try {
        const result =
          (await window.electron.secureWipe.checkBinary()) as BinaryCheckResult;
        setBinaryStatus(result);
        if (result.success && result.binaryStatus) {
          const status = result.binaryStatus.exists ? 'found' : 'not found';
          const executable =
            result.binaryStatus.isExecutable !== false
              ? 'executable'
              : 'not executable';
          addLog(
            `Binary ${status} at: ${result.binaryStatus.path} (${executable})`,
          );
          addLog(
            `Platform: ${result.platform} (supported: ${result.supportedPlatforms?.join(', ')})`,
          );

          if (!result.binaryStatus.exists) {
            addLog('Attempting to find binary...');
            const findResult = await window.electron.secureWipe.findBinary();
            if (findResult.success) {
              setBinaryStatus(findResult);
              if (findResult.found) {
                addLog(
                  `Binary found and updated: ${findResult.binaryStatus?.path}`,
                );
                // Auto-load system info and drives after finding binary
                await loadSystemInfo();
                await loadDrives();
              } else {
                addLog('Binary not found in any expected location');
              }
            }
          } else {
            // Binary exists, auto-load system info and drives
            await loadSystemInfo();
            await loadDrives();
          }
        } else {
          addLog(`Binary check failed: ${result.error}`);
        }
      } catch (error) {
        addLog(`Binary check error: ${error}`);
      }
    };

    const loadSystemInfo = async () => {
      try {
        addLog('Loading system information...');
        const result =
          (await window.electron.secureWipe.getSystemInfo()) as SystemInfoResult;

        if (result.success && result.systemInfo) {
          setSystemInfo(result.systemInfo);
          addLog('System information loaded successfully');
        } else {
          addLog(`Failed to load system info: ${result.error}`);
        }
      } catch (error) {
        addLog(`System info loading error: ${error}`);
      }
    };

    const loadDrives = async () => {
      try {
        addLog('Loading drives...');
        const result =
          (await window.electron.secureWipe.listDrives()) as DriveListResult;

        if (result.success && result.drives) {
          setDrives(result.drives);
          addLog(`Found ${result.drives.length} drives`);
        } else {
          addLog(`Failed to load drives: ${result.error}`);
        }
      } catch (error) {
        addLog(`Drive loading error: ${error}`);
      }
    };

    checkBinary();
  }, [addLog]);
  useEffect(() => {
    const cleanup = window.electron.secureWipe.onProgress(
      (event: SecureWipeEvent) => {
        setProgress(event);

        switch (event.type) {
          case 'start':
            addLog(
              `Started wiping with ${event.algorithm} algorithm (${event.total_passes} passes)`,
            );
            break;
          case 'pass_start':
            addLog(
              `Pass ${event.pass}/${event.total_passes} started with pattern: ${event.pattern}`,
            );
            break;
          case 'progress':
            // Don't log every progress update to avoid spam
            break;
          case 'pass_complete':
            addLog(`Pass ${event.pass}/${event.total_passes} completed`);
            break;
          case 'complete':
            addLog(
              `Wiping completed in ${event.total_time_seconds.toFixed(1)}s (${event.average_throughput_mb_s.toFixed(2)} MB/s)`,
            );
            setIsWiping(false);
            break;
          case 'error':
            addLog(`Error: ${event.message}`);
            setIsWiping(false);
            break;
          case 'info':
            addLog(`Info: ${event.message}`);
            break;
          case 'demo_file_created':
            addLog(`Demo file created: ${event.path} (${event.size_mb} MB)`);
            break;
        }
      },
    );

    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [addLog]);

  const handleStartWipe = async () => {
    if (!targetPath.trim()) {
      addLog('Please enter a target path');
      return;
    }

    const config: SecureWipeConfig = {
      target: targetPath.trim(),
      algorithm,
      bufferSize: bufferSize > 0 ? bufferSize : undefined,
      passes: useCustomPasses && customPasses > 0 ? customPasses : undefined,
    };

    try {
      setIsWiping(true);
      setProgress(null);
      addLog(`Starting wipe operation on: ${config.target}`);
      addLog(`Configuration: ${JSON.stringify(config, null, 2)}`);

      const result = (await window.electron.secureWipe.wipe(
        config,
      )) as SecureWipeResult;

      if (!result.success) {
        addLog(`Wipe failed: ${result.error}`);
        setIsWiping(false);
      }
    } catch (error) {
      addLog(`Wipe error: ${error}`);
      setIsWiping(false);
    }
  };

  const handleStartDemo = async () => {
    const config: SecureWipeConfig = {
      target: '', // Not used in demo mode
      algorithm,
      demo: true,
      demoSize: demoSize > 0 ? demoSize : 10,
      bufferSize: bufferSize > 0 ? bufferSize : undefined,
      passes: useCustomPasses && customPasses > 0 ? customPasses : undefined,
    };

    try {
      setIsWiping(true);
      setProgress(null);
      addLog('Starting demo wipe operation...');
      addLog(`Configuration: ${JSON.stringify(config, null, 2)}`);

      const result = (await window.electron.secureWipe.wipe(
        config,
      )) as SecureWipeResult;

      if (!result.success) {
        addLog(`Demo failed: ${result.error}`);
        setIsWiping(false);
      }
    } catch (error) {
      addLog(`Demo error: ${error}`);
      setIsWiping(false);
    }
  };

  const handleCancel = async () => {
    try {
      addLog('Cancelling operation...');
      await window.electron.secureWipe.cancel();
      setIsWiping(false);
      setProgress(null);
    } catch (error) {
      addLog(`Cancel error: ${error}`);
    }
  };

  const getProgressPercentage = (): number => {
    if (!progress || progress.type !== 'progress') return 0;
    return progress.percent;
  };

  const getProgressInfo = (): string => {
    if (!progress) return 'No operation in progress';

    switch (progress.type) {
      case 'start':
        return `Starting ${progress.algorithm} algorithm (${progress.total_passes} passes)`;
      case 'pass_start':
        return `Pass ${progress.pass}/${progress.total_passes} starting...`;
      case 'progress':
        const mbps = (progress.bytes_per_second / (1024 * 1024)).toFixed(2);
        return `Pass ${progress.pass}/${progress.total_passes}: ${progress.percent.toFixed(1)}% (${mbps} MB/s)`;
      case 'pass_complete':
        return `Pass ${progress.pass}/${progress.total_passes} completed`;
      case 'complete':
        return `Operation completed in ${progress.total_time_seconds.toFixed(1)}s`;
      case 'error':
        return `Error: ${progress.message}`;
      default:
        return progress.type;
    }
  };

  return (
    <div className="app-container fade-in">
      <div className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="status-indicator status-success">✅</span>
            <span style={{ fontSize: '14px', color: '#64748b' }}>
              Authenticated as: <strong>{userEmail}</strong>
            </span>
          </div>
          <button onClick={logout} className="danger" style={{ fontSize: '12px', padding: '6px 12px' }}>
            🚪 Logout
          </button>
        </div>
        <h1 className="app-title">Secure Wipe Demo</h1>
        <p className="app-subtitle">
          Professional data sanitization and secure file wiping demonstration
        </p>
      </div>

      {/* Binary Status Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">🔧</span>
          <h3 className="card-title">Binary Status</h3>
        </div>
        {binaryStatus ? (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <span
                className={`status-indicator ${
                  binaryStatus.binaryStatus?.exists
                    ? 'status-success'
                    : 'status-error'
                }`}
              >
                {binaryStatus.binaryStatus?.exists ? '✅' : '❌'}
                {binaryStatus.binaryStatus?.exists
                  ? 'Binary Found'
                  : 'Binary Not Found'}
                {binaryStatus.binaryStatus?.isExecutable === false &&
                  ' (Not Executable)'}
              </span>
            </div>
            <div className="form-group">
              <div className="form-label">Binary Path</div>
              <div
                style={{
                  fontFamily: 'Monaco, Menlo, monospace',
                  fontSize: '13px',
                  color: '#64748b',
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                {binaryStatus.binaryStatus?.path || 'Not available'}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div className="form-label">Platform</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {binaryStatus.platform}
                </div>
              </div>
              <div>
                <div className="form-label">Supported Platforms</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {binaryStatus.supportedPlatforms?.join(', ')}
                </div>
              </div>
            </div>
            {binaryStatus.binaryStatus?.error && (
              <div
                className="status-indicator status-error"
                style={{ marginBottom: '16px' }}
              >
                ⚠️ {binaryStatus.binaryStatus.error}
              </div>
            )}
            {!binaryStatus.binaryStatus?.exists && (
              <button
                onClick={async () => {
                  addLog('Attempting to find binary...');
                  const findResult =
                    await window.electron.secureWipe.findBinary();
                  if (findResult.success) {
                    setBinaryStatus(findResult);
                    if (findResult.found) {
                      addLog(`Binary found: ${findResult.binaryStatus?.path}`);
                    } else {
                      addLog('Binary not found');
                    }
                  }
                }}
                disabled={isWiping}
                className="success"
              >
                🔍 Search for Binary
              </button>
            )}
          </div>
        ) : (
          <div className="status-indicator status-info">
            🔄 Checking binary status...
          </div>
        )}
      </div>

      {/* System Information Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">💻</span>
          <h3 className="card-title">System Information</h3>
        </div>
        {systemInfo ? (
          <div style={{ marginTop: '16px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div className="form-label">Operating System</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {systemInfo.os_name} {systemInfo.os_version}
                </div>
              </div>
              <div>
                <div className="form-label">Architecture</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {systemInfo.architecture}
                </div>
              </div>
              <div>
                <div className="form-label">Hostname</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {systemInfo.hostname}
                </div>
              </div>
              <div>
                <div className="form-label">Username</div>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {systemInfo.username}
                </div>
              </div>
            </div>

            {/* Memory Information */}
            <div style={{ marginBottom: '16px' }}>
              <div className="form-label">Memory</div>
              <div
                style={{
                  fontSize: '14px',
                  color: '#64748b',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                }}
              >
                <span>
                  Total:{' '}
                  {(
                    systemInfo.total_memory_bytes /
                    (1024 * 1024 * 1024)
                  ).toFixed(2)}{' '}
                  GB
                </span>
                <span>
                  Available:{' '}
                  {(
                    systemInfo.available_memory_bytes /
                    (1024 * 1024 * 1024)
                  ).toFixed(2)}{' '}
                  GB
                </span>
              </div>
            </div>

            {/* CPU Information */}
            <div style={{ marginBottom: '16px' }}>
              <div className="form-label">CPU</div>
              <div style={{ fontSize: '14px', color: '#64748b' }}>
                <div style={{ marginBottom: '4px' }}>
                  {systemInfo.cpu_info.model_name}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '8px',
                  }}
                >
                  <span>Logical: {systemInfo.cpu_info.logical_cores}</span>
                  <span>Physical: {systemInfo.cpu_info.physical_cores}</span>
                  <span>Freq: {systemInfo.cpu_info.frequency_mhz} MHz</span>
                </div>
              </div>
            </div>

            {/* Storage Devices */}
            {systemInfo.storage_devices &&
              systemInfo.storage_devices.length > 0 && (
                <div>
                  <div className="form-label">Storage Devices</div>
                  <div
                    style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                    }}
                  >
                    {systemInfo.storage_devices.map((device, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '12px',
                          borderBottom:
                            index < systemInfo.storage_devices.length - 1
                              ? '1px solid #f1f5f9'
                              : 'none',
                          fontSize: '13px',
                        }}
                      >
                        <div
                          style={{ fontWeight: 'bold', marginBottom: '4px' }}
                        >
                          {device.name} ({device.device_type})
                        </div>
                        <div
                          style={{
                            color: '#64748b',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '8px',
                          }}
                        >
                          <span>
                            Size:{' '}
                            {(device.size_bytes / (1024 * 1024 * 1024)).toFixed(
                              2,
                            )}{' '}
                            GB
                          </span>
                          <span>FS: {device.file_system || 'N/A'}</span>
                        </div>
                        <div style={{ color: '#64748b', marginTop: '2px' }}>
                          Path: {device.device_path}{' '}
                          {device.mount_point && `→ ${device.mount_point}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        ) : (
          <div className="status-indicator status-info">
            🔄 Loading system information...
          </div>
        )}
      </div>

      {/* Drive List Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">💾</span>
          <h3 className="card-title">Available Drives</h3>
        </div>
        {drives.length > 0 ? (
          <div className="drive-list">
            {drives.map((drive, index) => (
              <div key={index} className="drive-item">
                <div className="drive-info">
                  <div className="drive-path">{drive.path}</div>
                  <div className="drive-description">{drive.description}</div>
                </div>
                <button
                  onClick={() => setTargetPath(drive.path)}
                  disabled={isWiping}
                  className="success"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-indicator status-info">
            🔄 Loading drives...
          </div>
        )}
      </div>

      {/* Configuration Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">⚙️</span>
          <h3 className="card-title">Wipe Configuration</h3>
        </div>

        {/* Target Path */}
        <div className="form-group">
          <label className="form-label">Target Path</label>
          <input
            type="text"
            className="form-input"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            placeholder="/path/to/file or /dev/device"
            disabled={isWiping}
          />
        </div>

        {/* Algorithm */}
        <div className="form-group">
          <label className="form-label">Algorithm</label>
          <select
            className="form-select"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as any)}
            disabled={isWiping}
          >
            <option value="random">Random (1 pass)</option>
            <option value="zeros">Zeros (1 pass)</option>
            <option value="ones">Ones (1 pass)</option>
            <option value="dod5220">DoD 5220.22-M (3 passes)</option>
            <option value="gutmann">Gutmann (35 passes)</option>
          </select>
        </div>

        {/* Advanced Options */}
        <div style={{ marginTop: '24px', marginBottom: '16px' }}>
          <div
            className="form-label"
            style={{ fontSize: '16px', fontWeight: 'bold' }}
          >
            Advanced Options
          </div>
        </div>

        {/* Buffer Size */}
        <div className="form-group">
          <label className="form-label">
            Buffer Size (KB)
            <span
              style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}
            >
              (Controls memory usage and performance)
            </span>
          </label>
          <input
            type="number"
            className="form-input"
            value={bufferSize}
            onChange={(e) => setBufferSize(parseInt(e.target.value) || 1024)}
            min="64"
            max="8192"
            step="64"
            disabled={isWiping}
          />
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Current: {(bufferSize / 1024).toFixed(1)} MB
          </div>
        </div>

        {/* Custom Passes */}
        <div className="form-group">
          <label
            className="form-label"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <input
              type="checkbox"
              checked={useCustomPasses}
              onChange={(e) => setUseCustomPasses(e.target.checked)}
              disabled={isWiping}
            />
            Override Algorithm Passes
          </label>
          {useCustomPasses && (
            <input
              type="number"
              className="form-input"
              value={customPasses}
              onChange={(e) => setCustomPasses(parseInt(e.target.value) || 1)}
              min="1"
              max="100"
              disabled={isWiping}
              style={{ marginTop: '8px' }}
            />
          )}
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {useCustomPasses
              ? `Will perform ${customPasses} passes instead of algorithm default`
              : 'Uses algorithm default pass count'}
          </div>
        </div>

        {/* Demo Size (only for demo mode) */}
        <div className="form-group">
          <label className="form-label">
            Demo File Size (MB)
            <span
              style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}
            >
              (Only used in demo mode)
            </span>
          </label>
          <input
            type="number"
            className="form-input"
            value={demoSize}
            onChange={(e) => setDemoSize(parseInt(e.target.value) || 10)}
            min="1"
            max="1000"
            disabled={isWiping}
          />
        </div>
      </div>

      {/* Configuration Summary */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">📋</span>
          <h3 className="card-title">Configuration Summary</h3>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            fontSize: '14px',
          }}
        >
          <div>
            <div className="form-label">Algorithm</div>
            <div style={{ color: '#64748b' }}>{algorithm.toUpperCase()}</div>
          </div>
          <div>
            <div className="form-label">Buffer Size</div>
            <div style={{ color: '#64748b' }}>
              {(bufferSize / 1024).toFixed(1)} MB
            </div>
          </div>
          <div>
            <div className="form-label">Passes</div>
            <div style={{ color: '#64748b' }}>
              {useCustomPasses
                ? `${customPasses} (custom)`
                : 'Algorithm default'}
            </div>
          </div>
          <div>
            <div className="form-label">Demo Size</div>
            <div style={{ color: '#64748b' }}>{demoSize} MB</div>
          </div>
        </div>
      </div>

      {/* Actions Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">🚀</span>
          <h3 className="card-title">Actions</h3>
        </div>
        <div className="action-buttons">
          <button
            onClick={handleStartDemo}
            disabled={isWiping || !binaryStatus?.binaryStatus?.exists}
            className="success"
          >
            🛡️ Start Demo (Safe)
          </button>
          <button
            onClick={handleStartWipe}
            disabled={
              isWiping || !targetPath || !binaryStatus?.binaryStatus?.exists
            }
            className="primary"
          >
            🔥 Start Wipe
          </button>
          {isWiping && (
            <button onClick={handleCancel} className="danger">
              ⏹️ Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress Card */}
      {(isWiping || progress) && (
        <div className="card">
          <div className="card-header">
            <span className="card-icon">📊</span>
            <h3 className="card-title">Progress</h3>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div className="status-indicator status-info">
              {getProgressInfo()}
            </div>
          </div>
          {progress?.type === 'progress' && (
            <div>
              <div className="progress-container">
                <div
                  className="progress-bar"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
              <div className="progress-text">
                {getProgressPercentage().toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">📝</span>
          <h3 className="card-title">Activity Log</h3>
        </div>
        <div className="log-container">
          {log.length > 0 ? (
            log.map((entry, index) => (
              <div key={index} className="log-entry">
                {entry}
              </div>
            ))
          ) : (
            <div
              className="log-entry"
              style={{ color: '#64748b', fontStyle: 'italic' }}
            >
              No activity yet...
            </div>
          )}
        </div>
        <button
          onClick={() => setLog([])}
          className="danger"
          style={{ marginTop: '12px' }}
        >
          🗑️ Clear Log
        </button>
      </div>
    </div>
  );
};
