/**
 * Example component demonstrating secure-wipe service usage
 * This shows how to use the service from the renderer process
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SecureWipeEvent,
  SecureWipeConfig,
  DriveInfo,
} from '../../main/types/secure-wipe';

interface SecureWipeResult {
  success: boolean;
  error?: string;
}

interface DriveListResult {
  success: boolean;
  drives?: DriveInfo[];
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
  const [targetPath, setTargetPath] = useState('');
  const [algorithm, setAlgorithm] = useState<
    'dod5220' | 'gutmann' | 'random' | 'zeros' | 'ones'
  >('random');
  const [isWiping, setIsWiping] = useState(false);
  const [progress, setProgress] = useState<SecureWipeEvent | null>(null);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
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
              } else {
                addLog('Binary not found in any expected location');
              }
            }
          }
        } else {
          addLog(`Binary check failed: ${result.error}`);
        }
      } catch (error) {
        addLog(`Binary check error: ${error}`);
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

  const handleListDrives = async () => {
    try {
      addLog('Listing drives...');
      const result =
        (await window.electron.secureWipe.listDrives()) as DriveListResult;

      if (result.success && result.drives) {
        setDrives(result.drives);
        addLog(`Found ${result.drives.length} drives`);
      } else {
        addLog(`Failed to list drives: ${result.error}`);
      }
    } catch (error) {
      addLog(`Drive listing error: ${error}`);
    }
  };

  const handleStartWipe = async () => {
    if (!targetPath.trim()) {
      addLog('Please enter a target path');
      return;
    }

    const config: SecureWipeConfig = {
      target: targetPath.trim(),
      algorithm,
      force: true, // Skip confirmation in demo
    };

    try {
      setIsWiping(true);
      setProgress(null);
      addLog(`Starting wipe operation on: ${config.target}`);

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
      force: true,
      demo: true,
      demoSize: 10, // 10 MB demo file
    };

    try {
      setIsWiping(true);
      setProgress(null);
      addLog('Starting demo wipe operation...');

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
              <span className={`status-indicator ${
                binaryStatus.binaryStatus?.exists 
                  ? 'status-success' 
                  : 'status-error'
              }`}>
                {binaryStatus.binaryStatus?.exists ? '✅' : '❌'}
                {binaryStatus.binaryStatus?.exists ? 'Binary Found' : 'Binary Not Found'}
                {binaryStatus.binaryStatus?.isExecutable === false && ' (Not Executable)'}
              </span>
            </div>
            <div className="form-group">
              <div className="form-label">Binary Path</div>
              <div style={{ 
                fontFamily: 'Monaco, Menlo, monospace', 
                fontSize: '13px', 
                color: '#64748b',
                padding: '8px 12px',
                backgroundColor: '#f8fafc',
                borderRadius: '6px',
                border: '1px solid #e2e8f0'
              }}>
                {binaryStatus.binaryStatus?.path || 'Not available'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
              <div className="status-indicator status-error" style={{ marginBottom: '16px' }}>
                ⚠️ {binaryStatus.binaryStatus.error}
              </div>
            )}
            {!binaryStatus.binaryStatus?.exists && (
              <button
                onClick={async () => {
                  addLog('Attempting to find binary...');
                  const findResult = await window.electron.secureWipe.findBinary();
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

      {/* Drive List Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">💾</span>
          <h3 className="card-title">Available Drives</h3>
        </div>
        <button onClick={handleListDrives} disabled={isWiping}>
          📋 List Drives
        </button>
        {drives.length > 0 && (
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
        )}
      </div>

      {/* Configuration Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">⚙️</span>
          <h3 className="card-title">Wipe Configuration</h3>
        </div>
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
              <div key={index} className="log-entry">{entry}</div>
            ))
          ) : (
            <div className="log-entry" style={{ color: '#64748b', fontStyle: 'italic' }}>
              No activity yet...
            </div>
          )}
        </div>
        <button onClick={() => setLog([])} className="danger" style={{ marginTop: '12px' }}>
          🗑️ Clear Log
        </button>
      </div>
    </div>
  );
};
