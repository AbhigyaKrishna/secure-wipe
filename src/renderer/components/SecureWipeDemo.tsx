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
  exists?: boolean;
  path?: string;
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
        if (result.success) {
          addLog(
            `Binary ${result.exists ? 'found' : 'not found'} at: ${result.path}`,
          );
        } else {
          addLog(`Binary check failed: ${result.error}`);
        }
      } catch (error) {
        addLog(`Binary check error: ${error}`);
      }
    };

    checkBinary();
  }, [addLog]);

  // Set up progress event listener
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
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Secure Wipe Service Demo</h2>

      {/* Binary Status */}
      <div
        style={{
          marginBottom: '20px',
          padding: '10px',
          backgroundColor: '#f0f0f0',
          borderRadius: '5px',
        }}
      >
        <h3>Binary Status</h3>
        {binaryStatus ? (
          <div>
            <p>Status: {binaryStatus.exists ? '✅ Found' : '❌ Not Found'}</p>
            <p>Path: {binaryStatus.path}</p>
          </div>
        ) : (
          <p>Checking...</p>
        )}
      </div>

      {/* Drive List */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Available Drives</h3>
        <button onClick={handleListDrives} disabled={isWiping}>
          List Drives
        </button>
        {drives.length > 0 && (
          <div
            style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}
          >
            {drives.map((drive, index) => (
              <div
                key={index}
                style={{
                  padding: '5px',
                  border: '1px solid #ddd',
                  margin: '2px',
                }}
              >
                <strong>{drive.path}</strong> - {drive.description}
                <button
                  onClick={() => setTargetPath(drive.path)}
                  style={{ marginLeft: '10px', fontSize: '12px' }}
                  disabled={isWiping}
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wipe Configuration */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Wipe Configuration</h3>
        <div style={{ marginBottom: '10px' }}>
          <label>
            Target Path:
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="/path/to/file or /dev/device"
              style={{ marginLeft: '10px', width: '300px' }}
              disabled={isWiping}
            />
          </label>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>
            Algorithm:
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as any)}
              style={{ marginLeft: '10px' }}
              disabled={isWiping}
            >
              <option value="random">Random (1 pass)</option>
              <option value="zeros">Zeros (1 pass)</option>
              <option value="ones">Ones (1 pass)</option>
              <option value="dod5220">DoD 5220.22-M (3 passes)</option>
              <option value="gutmann">Gutmann (35 passes)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Actions</h3>
        <button
          onClick={handleStartDemo}
          disabled={isWiping || !binaryStatus?.exists}
          style={{ marginRight: '10px' }}
        >
          Start Demo (Safe)
        </button>
        <button
          onClick={handleStartWipe}
          disabled={isWiping || !targetPath || !binaryStatus?.exists}
          style={{ marginRight: '10px' }}
        >
          Start Wipe
        </button>
        {isWiping && <button onClick={handleCancel}>Cancel</button>}
      </div>

      {/* Progress */}
      {(isWiping || progress) && (
        <div
          style={{
            marginBottom: '20px',
            padding: '10px',
            backgroundColor: '#e8f5e8',
            borderRadius: '5px',
          }}
        >
          <h3>Progress</h3>
          <p>{getProgressInfo()}</p>
          {progress?.type === 'progress' && (
            <div
              style={{
                width: '100%',
                backgroundColor: '#ddd',
                borderRadius: '5px',
                height: '20px',
              }}
            >
              <div
                style={{
                  width: `${getProgressPercentage()}%`,
                  backgroundColor: '#4CAF50',
                  height: '100%',
                  borderRadius: '5px',
                  transition: 'width 0.3s ease',
                }}
              />
              <div
                style={{
                  textAlign: 'center',
                  lineHeight: '20px',
                  marginTop: '-20px',
                }}
              >
                {getProgressPercentage().toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log */}
      <div>
        <h3>Log</h3>
        <div
          style={{
            height: '200px',
            overflowY: 'auto',
            border: '1px solid #ddd',
            padding: '10px',
            backgroundColor: '#f9f9f9',
            fontSize: '12px',
          }}
        >
          {log.map((entry, index) => (
            <div key={index}>{entry}</div>
          ))}
        </div>
        <button onClick={() => setLog([])} style={{ marginTop: '10px' }}>
          Clear Log
        </button>
      </div>
    </div>
  );
};
