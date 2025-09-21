/**
 * Enhanced SecureWipeDemo component with privilege escalation support
 *
 * This component demonstrates both basic and privilege-aware secure wipe functionality:
 *
 * Features:
 * - Automatic privilege detection based on target path
 * - Cross-platform privilege escalation (Linux: sudo/pkexec, macOS: sudo, Windows: UAC)
 * - Two wipe modes: Basic (original) and Smart (privilege-aware)
 * - Real-time privilege status display
 * - User control over privilege requests
 * - Transparent logging of all operations including privilege escalation
 *
 * Usage:
 * 1. Enter a target path to see privilege requirements
 * 2. Configure wipe settings (algorithm, buffer size, etc.)
 * 3. Choose whether to enable automatic privilege requests
 * 4. Use "Start Wipe (Basic)" for original behavior or "Start Wipe (Smart)" for privilege-aware operation
 * 5. Monitor progress and privilege operations in the activity log
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
  const [privilegeStatus, setPrivilegeStatus] =
    useState<PrivilegeStatus | null>(null);
  const [requestPrivileges, setRequestPrivileges] = useState(true);
  const [elevationDescription, setElevationDescription] = useState<string>('');
  const [supportsGui, setSupportsGui] = useState<boolean>(false);
  const [isCheckingPrivileges, setIsCheckingPrivileges] = useState(false);
  const [lastPrivilegeCheck, setLastPrivilegeCheck] = useState<Date | null>(
    null,
  );
  const [log, setLog] = useState<string[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);

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
            setIsCancelling(false);
            break;
          case 'error':
            addLog(`Error: ${event.message}`);
            setIsWiping(false);
            setIsCancelling(false);
            break;
          case 'info':
            addLog(`Info: ${event.message}`);
            // Check if this is a cancellation event
            if (
              event.message &&
              event.message.toLowerCase().includes('cancel')
            ) {
              setIsWiping(false);
              setProgress(null);
              setIsCancelling(false);
            }
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

  // Check privilege status when target path changes
  useEffect(() => {
    const checkPrivilegeStatus = async () => {
      if (!targetPath.trim()) {
        setPrivilegeStatus(null);
        setElevationDescription('');
        return;
      }

      try {
        addLog(`Checking privileges for: ${targetPath}`);

        const result = (await window.electron.secureWipe.checkPrivileges(
          targetPath,
        )) as PrivilegeStatus;
        setPrivilegeStatus(result);

        if (result.success) {
          addLog(
            `Current user: ${result.currentUser} (${result.isRoot ? 'admin' : 'regular user'})`,
          );
          addLog(
            `Has privileges: ${result.hasPrivileges ? 'Yes' : 'No'}, Needs elevation: ${result.needsElevation ? 'Yes' : 'No'}`,
          );
          if (result.method) {
            addLog(`Elevation method: ${result.method}`);
          }

          // Get elevation description if needed
          if (result.needsElevation) {
            try {
              const descResult =
                await window.electron.secureWipe.getElevationDescription(
                  targetPath,
                );
              if (descResult.success && descResult.description) {
                setElevationDescription(descResult.description);
                addLog(`Elevation prompt: ${descResult.description}`);
              }
            } catch (error) {
              addLog(`Failed to get elevation description: ${error}`);
            }
          } else {
            setElevationDescription('');
          }
        } else {
          addLog(`Privilege check failed: ${result.error}`);
        }
      } catch (error) {
        addLog(`Privilege check error: ${error}`);
        setPrivilegeStatus(null);
      }
    };

    // Debounce the privilege check to avoid too many calls
    const timeoutId = setTimeout(checkPrivilegeStatus, 500);
    return () => clearTimeout(timeoutId);
  }, [targetPath, addLog]);

  // Check GUI prompt support on mount
  useEffect(() => {
    const checkGuiSupport = async () => {
      try {
        const result = await window.electron.secureWipe.supportsGuiPrompts();
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
    setIsCancelling(true);
    try {
      addLog('🛑 Cancelling operation...');

      const result = await window.electron.secureWipe.cancel();

      if (result.success) {
        addLog('✅ Operation cancelled successfully');
        setIsWiping(false);
        setProgress(null);
      } else {
        addLog(`❌ Cancel failed: ${result.error || 'Unknown error'}`);
        // Still try to update UI state even if cancel failed
        setIsWiping(false);
        setProgress(null);
      }
    } catch (error) {
      addLog(`❌ Cancel error: ${error}`);
      // Force update UI state on error
      setIsWiping(false);
      setProgress(null);
    } finally {
      setIsCancelling(false);
    }
  };

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
      bufferSize: bufferSize > 0 ? bufferSize : undefined,
      passes: useCustomPasses && customPasses > 0 ? customPasses : undefined,
      requestPrivileges,
      privilegeOptions: {
        name: 'Secure Wipe',
        windowsHide: true,
      },
    };

    try {
      setIsWiping(true);
      setProgress(null);
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

      if (result.success) {
        addLog('✅ Privilege-aware wipe operation completed successfully!');
        if (result.privilegesRequested) {
          addLog(
            `   Privileges were requested using: ${result.privilegeMethod}`,
          );
        }
      } else {
        addLog(`❌ Privilege-aware wipe operation failed: ${result.error}`);
        if (result.privilegeError) {
          addLog(`   Privilege error: ${result.privilegeError}`);
        }
      }
    } catch (error) {
      addLog(`Privilege-aware wipe operation error: ${error}`);
    } finally {
      setIsWiping(false);
    }
  };

  const handleManualPrivilegeCheck = async () => {
    if (!targetPath.trim()) {
      addLog('Please enter a target path first');
      return;
    }

    setIsCheckingPrivileges(true);
    addLog('🔍 Manually checking privilege requirements...');

    try {
      const result = (await window.electron.secureWipe.checkPrivileges(
        targetPath,
      )) as PrivilegeStatus;
      setPrivilegeStatus(result);
      setLastPrivilegeCheck(new Date());

      if (result.success) {
        addLog('✅ Privilege check completed successfully');
        addLog(
          `   Current user: ${result.currentUser} (${result.isRoot ? 'Administrator' : 'Regular User'})`,
        );
        addLog(`   Platform: ${result.platform}`);
        addLog(
          `   Has current privileges: ${result.hasPrivileges ? 'Yes' : 'No'}`,
        );
        addLog(
          `   Requires elevation: ${result.needsElevation ? 'Yes' : 'No'}`,
        );

        if (result.needsElevation && result.method) {
          addLog(`   Elevation method: ${result.method}`);

          // Get detailed elevation description
          try {
            const descResult =
              await window.electron.secureWipe.getElevationDescription(
                targetPath,
              );
            if (descResult.success && descResult.description) {
              setElevationDescription(descResult.description);
              addLog(`   User prompt: "${descResult.description}"`);
            }
          } catch (error) {
            addLog(`   Failed to get elevation description: ${error}`);
          }
        } else {
          setElevationDescription('');
        }

        // Check binary access validation
        try {
          const binaryAccess =
            await window.electron.secureWipe.validateBinaryAccess();
          if (binaryAccess.success) {
            addLog(
              `   Binary access: ${binaryAccess.canExecute ? 'Executable' : 'Not executable'}`,
            );
            if (binaryAccess.needsElevation) {
              addLog(`   Binary requires elevation: Yes`);
            }
          }
        } catch (error) {
          addLog(`   Binary access check failed: ${error}`);
        }
      } else {
        addLog(`❌ Privilege check failed: ${result.error}`);
      }
    } catch (error) {
      addLog(`❌ Manual privilege check error: ${error}`);
      setPrivilegeStatus(null);
    } finally {
      setIsCheckingPrivileges(false);
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="status-indicator status-success">✅</span>
            <span style={{ fontSize: '14px', color: '#64748b' }}>
              Authenticated as: <strong>{userEmail}</strong>
            </span>
          </div>
          <button
            onClick={logout}
            className="danger"
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            🚪 Logout
          </button>
        </div>
        <h1 className="app-title">Secure Wipe Demo</h1>
        <p className="app-subtitle">
          Professional data sanitization and secure file wiping demonstration
        </p>
      </div>

      {/* Quick Privilege Status Summary */}
      <div
        className="card"
        style={{ marginBottom: '16px', backgroundColor: '#f8fafc' }}
      >
        <div style={{ padding: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '18px' }}>🔐</span>
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#374151',
              }}
            >
              Privilege Status Summary
            </h3>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <div className="privilege-info-box">
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#6b7280',
                  marginBottom: '4px',
                }}
              >
                Current User
              </div>
              <div style={{ fontSize: '14px', color: '#374151' }}>
                {privilegeStatus ? (
                  <>
                    {privilegeStatus.currentUser}
                    <span style={{ marginLeft: '8px' }}>
                      {privilegeStatus.isRoot ? '👑 Admin' : '👤 Regular'}
                    </span>
                  </>
                ) : (
                  'Not checked'
                )}
              </div>
            </div>

            <div className="privilege-info-box">
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#6b7280',
                  marginBottom: '4px',
                }}
              >
                Target Privileges
              </div>
              <div style={{ fontSize: '14px', color: '#374151' }}>
                {!targetPath.trim() ? (
                  'No target specified'
                ) : !privilegeStatus ? (
                  '🔄 Checking...'
                ) : privilegeStatus.needsElevation ? (
                  <span style={{ color: '#dc2626' }}>⚠️ Admin Required</span>
                ) : (
                  <span style={{ color: '#059669' }}>
                    ✅ No elevation needed
                  </span>
                )}
              </div>
            </div>

            <div className="privilege-info-box">
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#6b7280',
                  marginBottom: '4px',
                }}
              >
                Platform Support
              </div>
              <div style={{ fontSize: '14px', color: '#374151' }}>
                {privilegeStatus ? (
                  <>
                    {privilegeStatus.platform}
                    {privilegeStatus.method && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '12px',
                          color: '#6b7280',
                        }}
                      >
                        ({privilegeStatus.method})
                      </span>
                    )}
                  </>
                ) : (
                  'Unknown'
                )}
              </div>
            </div>

            <div className="privilege-info-box">
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#6b7280',
                  marginBottom: '4px',
                }}
              >
                GUI Prompts
              </div>
              <div style={{ fontSize: '14px', color: '#374151' }}>
                {supportsGui ? '✅ Supported' : '❌ Console only'}
              </div>
            </div>
          </div>

          {targetPath.trim() && !privilegeStatus && (
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button
                onClick={handleManualPrivilegeCheck}
                disabled={isWiping || isCheckingPrivileges}
                className="primary"
                style={{ fontSize: '12px', padding: '6px 16px' }}
              >
                {isCheckingPrivileges
                  ? '🔄 Checking...'
                  : '🔍 Check Privileges Now'}
              </button>
            </div>
          )}
        </div>
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

      {/* Privilege Status Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">🔐</span>
          <h3 className="card-title">Privilege Status</h3>
        </div>
        {targetPath.trim() ? (
          privilegeStatus ? (
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
                  <div className="form-label">Target Path</div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#64748b',
                      fontFamily: 'Monaco, Menlo, monospace',
                    }}
                  >
                    {targetPath}
                  </div>
                </div>
                <div>
                  <div className="form-label">Current User</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>
                    {privilegeStatus.currentUser} (
                    {privilegeStatus.isRoot ? '👑 Admin' : '👤 Regular'})
                  </div>
                </div>
                <div>
                  <div className="form-label">Has Privileges</div>
                  <span
                    className={`status-indicator ${
                      privilegeStatus.hasPrivileges
                        ? 'status-success'
                        : 'status-warning'
                    }`}
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                  >
                    {privilegeStatus.hasPrivileges ? '✅ Yes' : '⚠️ No'}
                  </span>
                </div>
                <div>
                  <div className="form-label">Needs Elevation</div>
                  <span
                    className={`status-indicator ${
                      privilegeStatus.needsElevation
                        ? 'status-warning'
                        : 'status-success'
                    }`}
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                  >
                    {privilegeStatus.needsElevation ? '⚠️ Yes' : '✅ No'}
                  </span>
                </div>
              </div>

              {privilegeStatus.needsElevation && (
                <div
                  className="status-indicator status-info"
                  style={{ marginBottom: '16px' }}
                >
                  ⚠️ Admin privileges required for this target path
                  {elevationDescription && (
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '4px',
                        opacity: 0.8,
                      }}
                    >
                      Method: {elevationDescription}
                    </div>
                  )}
                  {!supportsGui && (
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '4px',
                        opacity: 0.8,
                      }}
                    >
                      Note: Console-based authentication (no GUI dialog)
                    </div>
                  )}
                </div>
              )}

              {privilegeStatus.method && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="form-label">Elevation Method</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>
                    {privilegeStatus.method}
                  </div>
                </div>
              )}

              {/* Platform and GUI Support Info */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div className="form-label">Platform</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>
                    {privilegeStatus.platform}
                  </div>
                </div>
                <div>
                  <div className="form-label">GUI Prompts</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>
                    {supportsGui ? '✅ Supported' : '❌ Console Only'}
                  </div>
                </div>
              </div>

              {/* Last Check Info */}
              {lastPrivilegeCheck && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="form-label">Last Checked</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {lastPrivilegeCheck.toLocaleString()}
                  </div>
                </div>
              )}

              {/* Manual Check Button */}
              <div
                style={{ display: 'flex', gap: '12px', alignItems: 'center' }}
              >
                <button
                  onClick={handleManualPrivilegeCheck}
                  disabled={
                    isWiping || isCheckingPrivileges || !targetPath.trim()
                  }
                  className="primary"
                  style={{ flex: 1 }}
                >
                  {isCheckingPrivileges
                    ? '🔄 Checking...'
                    : '🔍 Check Privileges'}
                </button>
                <button
                  onClick={() => {
                    setPrivilegeStatus(null);
                    setElevationDescription('');
                    setLastPrivilegeCheck(null);
                    addLog('🗑️ Privilege status cleared');
                  }}
                  disabled={
                    isWiping || isCheckingPrivileges || !privilegeStatus
                  }
                  className="danger"
                  style={{ padding: '8px 12px' }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div
                className="status-indicator status-info"
                style={{ marginBottom: '16px' }}
              >
                🔄 Checking privilege requirements...
              </div>
              <button
                onClick={handleManualPrivilegeCheck}
                disabled={
                  isWiping || isCheckingPrivileges || !targetPath.trim()
                }
                className="primary"
                style={{ width: '100%' }}
              >
                {isCheckingPrivileges
                  ? '🔄 Checking...'
                  : '🔍 Force Check Privileges'}
              </button>
            </div>
          )
        ) : (
          <div>
            <div
              style={{
                marginTop: '16px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#64748b',
              }}
            >
              Enter a target path to check privilege requirements
            </div>
            <div
              className="status-indicator status-info"
              style={{ marginBottom: '16px' }}
            >
              ℹ️ <strong>Tip:</strong> Try different paths to see how privilege
              requirements change:
              <ul style={{ margin: '8px 0 0 16px', fontSize: '12px' }}>
                <li>
                  <code>/tmp/test-file</code> - Usually no privileges needed
                </li>
                <li>
                  <code>/etc/test-file</code> - Requires admin privileges
                </li>
                <li>
                  <code>/dev/sda</code> - Requires admin privileges (disk
                  device)
                </li>
                <li>
                  <code>C:\\Windows\\test.txt</code> - Windows admin required
                </li>
              </ul>
            </div>
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

        {/* Privilege Escalation Options */}
        <div style={{ marginTop: '24px', marginBottom: '16px' }}>
          <div
            className="form-label"
            style={{ fontSize: '16px', fontWeight: 'bold' }}
          >
            Privilege Options
          </div>
        </div>

        <div className="form-group">
          <label
            className="form-label"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <input
              type="checkbox"
              checked={requestPrivileges}
              onChange={(e) => setRequestPrivileges(e.target.checked)}
              disabled={isWiping}
            />
            Request admin privileges automatically
          </label>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            When enabled, the application will automatically request admin
            privileges if needed. When disabled, operations requiring privileges
            may fail.
            {privilegeStatus?.needsElevation && (
              <div
                style={{
                  marginTop: '4px',
                  fontWeight: 'bold',
                  color: requestPrivileges ? '#059669' : '#dc2626',
                }}
              >
                {requestPrivileges
                  ? `✅ Will request privileges using: ${privilegeStatus.method || 'system default'}`
                  : `⚠️ Privileges required but automatic requests are disabled`}
              </div>
            )}
          </div>
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
          <div>
            <div className="form-label">Request Privileges</div>
            <div style={{ color: '#64748b' }}>
              {requestPrivileges ? '✅ Enabled' : '❌ Disabled'}
            </div>
          </div>
          <div>
            <div className="form-label">Privilege Status</div>
            <div style={{ color: '#64748b' }}>
              {!targetPath.trim()
                ? 'No target selected'
                : !privilegeStatus
                  ? 'Checking...'
                  : privilegeStatus.needsElevation
                    ? `⚠️ Admin required (${privilegeStatus.method})`
                    : '✅ No elevation needed'}
            </div>
          </div>
        </div>
      </div>

      {/* Actions Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-icon">🚀</span>
          <h3 className="card-title">Actions</h3>
        </div>

        {/* Privilege Tools Section */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              marginBottom: '12px',
              color: '#374151',
            }}
          >
            🔐 Privilege Tools
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleManualPrivilegeCheck}
              disabled={isWiping || isCheckingPrivileges || !targetPath.trim()}
              className="primary"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                minWidth: '120px',
              }}
            >
              {isCheckingPrivileges ? '🔄 Checking...' : '🔍 Check Privileges'}
            </button>

            <button
              onClick={async () => {
                try {
                  addLog('🔧 Checking GUI prompt support...');
                  const result =
                    await window.electron.secureWipe.supportsGuiPrompts();
                  if (result.success) {
                    setSupportsGui(result.supportsGui || false);
                    addLog(
                      `GUI prompts: ${result.supportsGui ? '✅ Supported' : '❌ Console only'}`,
                    );
                  } else {
                    addLog(`❌ Failed to check GUI support: ${result.error}`);
                  }
                } catch (error) {
                  addLog(`❌ GUI support check error: ${error}`);
                }
              }}
              disabled={isWiping || isCheckingPrivileges}
              className="primary"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                minWidth: '120px',
              }}
            >
              🖥️ Check GUI Support
            </button>

            <button
              onClick={async () => {
                try {
                  addLog('🔧 Validating binary access...');
                  const result =
                    await window.electron.secureWipe.validateBinaryAccess();
                  if (result.success) {
                    addLog(`✅ Binary validation completed:`);
                    addLog(
                      `   Can execute: ${result.canExecute ? 'Yes' : 'No'}`,
                    );
                    addLog(
                      `   Needs elevation: ${result.needsElevation ? 'Yes' : 'No'}`,
                    );
                    if (result.error) {
                      addLog(`   Warning: ${result.error}`);
                    }
                  } else {
                    addLog(`❌ Binary validation failed: ${result.error}`);
                  }
                } catch (error) {
                  addLog(`❌ Binary validation error: ${error}`);
                }
              }}
              disabled={isWiping || isCheckingPrivileges}
              className="primary"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                minWidth: '120px',
              }}
            >
              🔧 Validate Binary
            </button>
          </div>
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
            🔥 Start Wipe (Basic)
          </button>
          <button
            onClick={handleStartPrivilegeAwareWipe}
            disabled={
              isWiping ||
              !targetPath ||
              !binaryStatus?.binaryStatus?.exists ||
              !privilegeStatus
            }
            className={privilegeStatus?.needsElevation ? 'danger' : 'primary'}
            style={{ position: 'relative' }}
          >
            {privilegeStatus?.needsElevation && requestPrivileges ? '🔐' : '🔥'}{' '}
            Start Wipe (Smart)
            {privilegeStatus?.needsElevation && (
              <span
                style={{
                  fontSize: '10px',
                  marginLeft: '4px',
                  opacity: 0.8,
                }}
              >
                {requestPrivileges ? '(will request admin)' : '(may fail)'}
              </span>
            )}
          </button>
          {isWiping && (
            <button
              onClick={handleCancel}
              className="danger"
              disabled={isCancelling}
              style={{
                position: 'relative',
                opacity: isCancelling ? 0.7 : 1,
              }}
            >
              {isCancelling ? '⏳ Cancelling...' : '⏹️ Cancel'}
            </button>
          )}
        </div>

        {/* Privilege Warning */}
        {privilegeStatus?.needsElevation && !requestPrivileges && (
          <div
            className="status-indicator status-error"
            style={{ marginTop: '16px' }}
          >
            ⚠️ <strong>Warning:</strong> Admin privileges are required for the
            target path "{targetPath}", but automatic privilege requests are
            disabled. The "Smart" wipe operation may fail unless you run this
            application as administrator.
          </div>
        )}

        {privilegeStatus?.needsElevation && requestPrivileges && (
          <div
            className="status-indicator status-info"
            style={{ marginTop: '16px' }}
          >
            ℹ️ <strong>Info:</strong> The "Smart" wipe will automatically
            request admin privileges using{' '}
            {privilegeStatus.method || 'system default method'}.
            {!supportsGui &&
              ' Note: Console-based authentication will be used.'}
          </div>
        )}
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

// Add CSS styles for privilege-related elements
const privilegeStyles = `
  .status-warning {
    background-color: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
  }

  .status-success {
    background-color: #d1fae5;
    color: #065f46;
    border: 1px solid #10b981;
  }

  .status-error {
    background-color: #fee2e2;
    color: #991b1b;
    border: 1px solid #ef4444;
  }

  .status-info {
    background-color: #dbeafe;
    color: #1e40af;
    border: 1px solid #3b82f6;
  }

  .status-indicator {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    display: inline-block;
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .action-buttons button {
    width: 100%;
    transition: all 0.2s ease;
  }

  .action-buttons button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .action-buttons button.danger {
    background-color: #dc2626;
    border-color: #dc2626;
  }

  .action-buttons button.danger:hover:not(:disabled) {
    background-color: #b91c1c;
    border-color: #b91c1c;
  }

  /* Privilege tools styling */
  .privilege-tools {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
  }

  .privilege-tools button {
    transition: all 0.2s ease;
    border-radius: 6px;
  }

  .privilege-tools button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .privilege-tools button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Status indicators with better visibility */
  .privilege-status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .privilege-info-box {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
  }

  .privilege-info-box code {
    background-color: #e2e8f0;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 11px;
  }

  @media (min-width: 768px) {
    .action-buttons {
      flex-direction: row;
    }
  }
`;

// Inject styles into the document head
if (
  typeof document !== 'undefined' &&
  !document.getElementById('privilege-styles')
) {
  const styleElement = document.createElement('style');
  styleElement.id = 'privilege-styles';
  styleElement.textContent = privilegeStyles;
  document.head.appendChild(styleElement);
}
