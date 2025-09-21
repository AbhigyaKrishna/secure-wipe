/**
 * Enhanced SecureWipeDemo component demonstrating admin privilege handling
 * This component shows how to use the new privilege-aware secure wipe functionality
 */

import React, { useState, useEffect, useCallback } from 'react';

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

interface PrivilegeAwareWipeResult {
  success: boolean;
  error?: string;
  privilegesRequested?: boolean;
  privilegeMethod?: string;
  privilegeError?: string;
}

interface ElevationDescription {
  success: boolean;
  description?: string;
  error?: string;
}

interface GuiPromptSupport {
  success: boolean;
  supportsGui?: boolean;
  error?: string;
}

export const PrivilegeAwareWipeDemo: React.FC = () => {
  const [targetPath, setTargetPath] = useState('/tmp/test-file');
  const [algorithm, setAlgorithm] = useState<
    'random' | 'zeros' | 'ones' | 'dod5220' | 'gutmann'
  >('random');
  const [privilegeStatus, setPrivilegeStatus] =
    useState<PrivilegeStatus | null>(null);
  const [elevationDescription, setElevationDescription] = useState<string>('');
  const [supportsGui, setSupportsGui] = useState<boolean>(false);
  const [isWiping, setIsWiping] = useState(false);
  const [requestPrivileges, setRequestPrivileges] = useState(true);
  const [wipeResult, setWipeResult] = useState<PrivilegeAwareWipeResult | null>(
    null,
  );
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    setLog((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  }, []);

  // Check privilege status when component mounts or target path changes
  useEffect(() => {
    const checkPrivilegeStatus = async () => {
      if (!targetPath.trim()) return;

      try {
        addLog(`Checking privileges for: ${targetPath}`);

        // Check if privileges are needed for this target
        const result = (await window.electron.secureWipe.checkPrivileges(
          targetPath,
        )) as PrivilegeStatus;
        setPrivilegeStatus(result);

        if (result.success) {
          addLog(`Privilege check completed:`);
          addLog(
            `  Current user: ${result.currentUser} (${result.isRoot ? 'admin' : 'regular user'})`,
          );
          addLog(`  Platform: ${result.platform}`);
          addLog(`  Has privileges: ${result.hasPrivileges ? 'Yes' : 'No'}`);
          addLog(`  Needs elevation: ${result.needsElevation ? 'Yes' : 'No'}`);
          if (result.method) {
            addLog(`  Elevation method: ${result.method}`);
          }
        } else {
          addLog(`Privilege check failed: ${result.error}`);
        }
      } catch (error) {
        addLog(`Privilege check error: ${error}`);
      }
    };

    checkPrivilegeStatus();
  }, [targetPath, addLog]);

  // Get elevation description when privilege status changes
  useEffect(() => {
    const getElevationDescription = async () => {
      if (!privilegeStatus?.needsElevation) return;

      try {
        const result =
          (await window.electron.secureWipe.getElevationDescription(
            targetPath,
          )) as ElevationDescription;
        if (result.success && result.description) {
          setElevationDescription(result.description);
          addLog(`Elevation method: ${result.description}`);
        }
      } catch (error) {
        addLog(`Failed to get elevation description: ${error}`);
      }
    };

    getElevationDescription();
  }, [privilegeStatus, targetPath, addLog]);

  // Check GUI prompt support on mount
  useEffect(() => {
    const checkGuiSupport = async () => {
      try {
        const result =
          (await window.electron.secureWipe.supportsGuiPrompts()) as GuiPromptSupport;
        if (result.success) {
          setSupportsGui(result.supportsGui || false);
          addLog(
            `GUI privilege prompts: ${result.supportsGui ? 'Supported' : 'Not supported'}`,
          );
        }
      } catch (error) {
        addLog(`Failed to check GUI prompt support: ${error}`);
      }
    };

    checkGuiSupport();
  }, [addLog]);

  const handleStartPrivilegeAwareWipe = async () => {
    if (!targetPath.trim()) {
      addLog('Please enter a target path');
      return;
    }

    if (!privilegeStatus) {
      addLog('Privilege status not available, please wait...');
      return;
    }

    const config = {
      target: targetPath.trim(),
      algorithm,
      requestPrivileges,
      privilegeOptions: {
        name: 'Secure Wipe',
        windowsHide: true,
      },
    };

    try {
      setIsWiping(true);
      setWipeResult(null);
      addLog('Starting privilege-aware wipe operation...');
      addLog(`Configuration: ${JSON.stringify(config, null, 2)}`);

      if (privilegeStatus.needsElevation && requestPrivileges) {
        addLog('⚠️  Admin privileges will be requested');
        if (elevationDescription) {
          addLog(`   ${elevationDescription}`);
        }
        if (!supportsGui) {
          addLog('   Note: Console-based privilege prompt (no GUI)');
        }
      }

      const result = (await window.electron.secureWipe.wipeWithPrivileges(
        config,
      )) as PrivilegeAwareWipeResult;
      setWipeResult(result);

      if (result.success) {
        addLog('✅ Wipe operation completed successfully!');
        if (result.privilegesRequested) {
          addLog(
            `   Privileges were requested using: ${result.privilegeMethod}`,
          );
        }
      } else {
        addLog(`❌ Wipe operation failed: ${result.error}`);
        if (result.privilegeError) {
          addLog(`   Privilege error: ${result.privilegeError}`);
        }
      }
    } catch (error) {
      addLog(`Wipe operation error: ${error}`);
      setWipeResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsWiping(false);
    }
  };

  const handleCancel = async () => {
    try {
      addLog('Attempting to cancel operation...');
      await window.electron.secureWipe.cancel();
      setIsWiping(false);
    } catch (error) {
      addLog(`Cancel error: ${error}`);
    }
  };

  return (
    <div className="app-container fade-in">
      <div className="app-header">
        <h1 className="app-title">🔐 Privilege-Aware Secure Wipe</h1>
        <p className="app-subtitle">
          Demonstrates automatic admin privilege handling for secure wipe
          operations
        </p>
      </div>

      {/* Privilege Status Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">👤</span>
          <h3 className="card-title">Current Privilege Status</h3>
        </div>

        {privilegeStatus ? (
          <div>
            <div className="privilege-status">
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Current User:</span>
                  <span className="status-value">
                    {privilegeStatus.currentUser}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">User Type:</span>
                  <span
                    className={`status-badge ${privilegeStatus.isRoot ? 'admin' : 'regular'}`}
                  >
                    {privilegeStatus.isRoot
                      ? '👑 Administrator'
                      : '👤 Regular User'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Platform:</span>
                  <span className="status-value">
                    {privilegeStatus.platform}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Has Privileges:</span>
                  <span
                    className={`status-badge ${privilegeStatus.hasPrivileges ? 'success' : 'warning'}`}
                  >
                    {privilegeStatus.hasPrivileges ? '✅ Yes' : '⚠️  No'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Needs Elevation:</span>
                  <span
                    className={`status-badge ${privilegeStatus.needsElevation ? 'warning' : 'success'}`}
                  >
                    {privilegeStatus.needsElevation ? '⚠️  Yes' : '✅ No'}
                  </span>
                </div>
                {privilegeStatus.method && (
                  <div className="status-item">
                    <span className="status-label">Elevation Method:</span>
                    <span className="status-value">
                      {privilegeStatus.method}
                    </span>
                  </div>
                )}
              </div>

              {privilegeStatus.needsElevation && (
                <div className="privilege-info">
                  <div className="info-box warning">
                    <h4>⚠️ Admin Privileges Required</h4>
                    <p>
                      This operation requires administrator privileges to access
                      the target path.
                      {elevationDescription && (
                        <>
                          <br />
                          <strong>Elevation method:</strong>{' '}
                          {elevationDescription}
                        </>
                      )}
                    </p>
                    {!supportsGui && (
                      <p className="note">
                        <strong>Note:</strong> Your system will use
                        console-based authentication (no graphical dialog).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="status-indicator status-info">
            🔄 Checking privilege status...
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
          <div className="form-help">
            Try different paths to see privilege requirements change (e.g.,
            /tmp/file vs /etc/file)
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Wipe Algorithm</label>
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

        <div className="form-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={requestPrivileges}
              onChange={(e) => setRequestPrivileges(e.target.checked)}
              disabled={isWiping}
            />
            <span>Request admin privileges automatically</span>
          </label>
          <div className="form-help">
            When enabled, the application will automatically request admin
            privileges if needed. When disabled, the operation may fail if
            privileges are required.
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
            onClick={handleStartPrivilegeAwareWipe}
            disabled={isWiping || !targetPath.trim()}
            className="primary"
          >
            {privilegeStatus?.needsElevation && requestPrivileges
              ? '🔐 Start Wipe (with privileges)'
              : '🔥 Start Wipe'}
          </button>

          {isWiping && (
            <button onClick={handleCancel} className="danger">
              ⏹️ Cancel
            </button>
          )}
        </div>

        {privilegeStatus?.needsElevation && !requestPrivileges && (
          <div className="info-box warning" style={{ marginTop: '16px' }}>
            <strong>Warning:</strong> Admin privileges are required for this
            target, but automatic privilege requests are disabled. The operation
            may fail.
          </div>
        )}
      </div>

      {/* Results Card */}
      {wipeResult && (
        <div className="card">
          <div className="card-header">
            <span className="card-icon">
              {wipeResult.success ? '✅' : '❌'}
            </span>
            <h3 className="card-title">Operation Result</h3>
          </div>

          <div
            className={`info-box ${wipeResult.success ? 'success' : 'error'}`}
          >
            <h4>{wipeResult.success ? '✅ Success' : '❌ Failed'}</h4>
            {wipeResult.error && (
              <p>
                <strong>Error:</strong> {wipeResult.error}
              </p>
            )}
            {wipeResult.privilegesRequested && (
              <div>
                <p>
                  <strong>Privileges requested:</strong> Yes
                </p>
                {wipeResult.privilegeMethod && (
                  <p>
                    <strong>Method used:</strong> {wipeResult.privilegeMethod}
                  </p>
                )}
                {wipeResult.privilegeError && (
                  <p>
                    <strong>Privilege error:</strong>{' '}
                    {wipeResult.privilegeError}
                  </p>
                )}
              </div>
            )}
          </div>
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

      {/* Documentation Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">📚</span>
          <h3 className="card-title">How It Works</h3>
        </div>

        <div className="documentation">
          <h4>Privilege Detection</h4>
          <p>
            The application automatically detects whether admin privileges are
            needed based on the target path. It checks file permissions and
            system requirements before starting the wipe operation.
          </p>

          <h4>Cross-Platform Support</h4>
          <ul>
            <li>
              <strong>Linux:</strong> Uses <code>sudo</code> or{' '}
              <code>pkexec</code> for elevation
            </li>
            <li>
              <strong>macOS:</strong> Uses <code>sudo</code> with native
              authorization dialogs
            </li>
            <li>
              <strong>Windows:</strong> Uses UAC (User Account Control) prompts
            </li>
          </ul>

          <h4>Security Features</h4>
          <ul>
            <li>Path validation to prevent unauthorized access</li>
            <li>Safety checks before wiping system-critical locations</li>
            <li>Privilege escalation only when necessary</li>
            <li>Transparent logging of all privilege operations</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// Add some CSS styles for the new components
const styles = `
  .privilege-status {
    margin-top: 16px;
  }

  .status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .status-label {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-value {
    font-size: 14px;
    color: #1e293b;
    font-weight: 500;
  }

  .status-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }

  .status-badge.admin {
    background-color: #fef3c7;
    color: #92400e;
  }

  .status-badge.regular {
    background-color: #e0e7ff;
    color: #3730a3;
  }

  .status-badge.success {
    background-color: #d1fae5;
    color: #065f46;
  }

  .status-badge.warning {
    background-color: #fef3c7;
    color: #92400e;
  }

  .privilege-info {
    margin-top: 16px;
  }

  .info-box {
    padding: 16px;
    border-radius: 8px;
    border: 1px solid;
  }

  .info-box.warning {
    background-color: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }

  .info-box.success {
    background-color: #d1fae5;
    border-color: #10b981;
    color: #065f46;
  }

  .info-box.error {
    background-color: #fee2e2;
    border-color: #ef4444;
    color: #991b1b;
  }

  .info-box h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
  }

  .info-box p {
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
  }

  .info-box .note {
    margin-top: 8px;
    font-style: italic;
    opacity: 0.9;
  }

  .form-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .form-checkbox input[type="checkbox"] {
    margin: 0;
  }

  .form-help {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
    line-height: 1.4;
  }

  .documentation h4 {
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0 8px 0;
  }

  .documentation h4:first-child {
    margin-top: 0;
  }

  .documentation p {
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
    margin: 0 0 12px 0;
  }

  .documentation ul {
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
    margin: 0 0 12px 16px;
    padding: 0;
  }

  .documentation li {
    margin-bottom: 4px;
  }

  .documentation code {
    background-color: #f1f5f9;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
  }
`;

// Inject styles into the document head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}
