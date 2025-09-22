import React, { useState, useEffect, useCallback } from 'react';
import {
  SecureWipeEvent,
  SecureWipeConfig,
  DriveInfo,
  SystemInfo,
  ErrorEvent,
  ProgressEvent as SecureWipeProgressEvent,
  DemoFileCreatingEvent,
  DemoFileCreatedEvent,
  StartEvent,
  PassStartEvent,
  PassCompleteEvent,
  InfoEvent,
} from '../../main/types/secure-wipe';
import { useAuth } from '../contexts/AuthContext';
import './SecureWipeDemo.css';

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

export default function SecureWipeDemo(): React.ReactElement {
  const { userEmail, logout } = useAuth();

  // Core state
  const [targetPath, setTargetPath] = useState('');
  const [algorithm, setAlgorithm] = useState<
    'dod5220' | 'gutmann' | 'random' | 'zeros' | 'ones'
  >('random');
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
  const [animationPhase, setAnimationPhase] = useState<string>('');

  // System state
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [binaryStatus, setBinaryStatus] = useState<BinaryCheckResult | null>(
    null,
  );
  const [privilegeStatus, setPrivilegeStatus] =
    useState<PrivilegeStatus | null>(null);
  const [isCheckingPrivileges, setIsCheckingPrivileges] = useState(false);
  const [elevationDescription, setElevationDescription] = useState('');
  const [supportsGui, setSupportsGui] = useState(false);

  // Loading states for better UX
  const [isLoadingSystem, setIsLoadingSystem] = useState(false);
  const [isLoadingDrives, setIsLoadingDrives] = useState(false);
  const [isLoadingBinary, setIsLoadingBinary] = useState(false);

  // Logging function - defined early to be used by other functions
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Load system information
  const loadSystemInfo = useCallback(async () => {
    setIsLoadingSystem(true);
    try {
      const result: SystemInfoResult =
        await window.electron.secureWipe.getSystemInfo();
      if (result.success && result.systemInfo) {
        setSystemInfo(result.systemInfo);
        setSupportsGui(result.systemInfo.supportsGuiPrompts || false);
        addLog(
          `✅ System info loaded: ${result.systemInfo.os_name} ${result.systemInfo.architecture}`,
        );

        // Extract drives from system info as backup
        if (
          result.systemInfo.storage_devices &&
          result.systemInfo.storage_devices.length > 0
        ) {
          const mappedDrives = result.systemInfo.storage_devices.map(
            (device) => ({
              path: device.device_path,
              drive_type: 'disk' as const,
              size_bytes: device.size_bytes,
              size_gb:
                Math.round((device.size_bytes / (1024 * 1024 * 1024)) * 100) /
                100,
              description: `${device.mount_point} (${device.file_system}) - ${Math.round((device.size_bytes / (1024 * 1024 * 1024)) * 100) / 100} GB`,
            }),
          );
          setDrives(mappedDrives);
          addLog(`✅ Found ${mappedDrives.length} drives from system info`);
        }
      } else {
        addLog(`❌ Failed to load system info: ${result.error}`);
      }
    } catch (error) {
      addLog(
        `❌ System info error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsLoadingSystem(false);
    }
  }, [addLog]);

  // Load drives using proper API (with fallback to system info)
  const loadDrives = useCallback(async () => {
    setIsLoadingDrives(true);
    try {
      addLog('🔍 Attempting to load drives via drive list API...');
      const result: DriveListResult =
        await window.electron.secureWipe.listDrives();
      addLog(`📋 Drive list API result: ${JSON.stringify(result)}`);

      if (result.success && result.drives && result.drives.length > 0) {
        setDrives(result.drives);
        addLog(`✅ Found ${result.drives.length} drives via drive list API`);
      } else {
        addLog(
          `⚠️ Drive list API failed: ${result.error || 'No drives returned'}, using system info drives`,
        );
        // Drives should already be loaded from system info as fallback
      }
    } catch (error) {
      addLog(
        `⚠️ Drive list API error: ${error instanceof Error ? error.message : 'Unknown error'}, using system info drives`,
      );
      // Drives should already be loaded from system info as fallback
    } finally {
      setIsLoadingDrives(false);
    }
  }, [addLog]);

  // Check binary status
  const checkBinaryStatus = useCallback(async () => {
    setIsLoadingBinary(true);
    try {
      addLog('🔍 Checking binary status...');
      const result: BinaryCheckResult =
        await window.electron.secureWipe.checkBinary();
      addLog(`📋 Binary check result: ${JSON.stringify(result)}`);
      setBinaryStatus(result);

      if (result.success && result.binaryStatus?.exists) {
        addLog(`✅ Binary found: ${result.binaryStatus.path}`);
      } else {
        addLog(`❌ Binary not found: ${result.error || 'Unknown error'}`);
        // Try to find the binary automatically
        addLog('🔍 Attempting to find binary automatically...');
        try {
          const findResult = await window.electron.secureWipe.findBinary();
          addLog(`📋 Find binary result: ${JSON.stringify(findResult)}`);
          if (findResult.success) {
            setBinaryStatus(findResult);
            addLog(
              `✅ Binary found automatically: ${findResult.binaryStatus?.path}`,
            );
          }
        } catch (findError) {
          addLog(
            `❌ Auto-find binary error: ${findError instanceof Error ? findError.message : 'Unknown error'}`,
          );
        }
      }
    } catch (error) {
      addLog(
        `❌ Binary check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsLoadingBinary(false);
    }
  }, [addLog]);

  // Check privileges
  const checkPrivileges = useCallback(
    async (path: string) => {
      if (!path.trim()) return;

      setIsCheckingPrivileges(true);
      try {
        const result: PrivilegeStatus =
          await window.electron.secureWipe.checkPrivileges(path);
        setPrivilegeStatus(result);

        if (result.success) {
          addLog(`✅ Privilege check completed for: ${path}`);
          addLog(
            `  Current user: ${result.currentUser} (${result.isRoot ? 'admin' : 'regular user'})`,
          );
          addLog(`  Platform: ${result.platform}`);
          addLog(`  Has privileges: ${result.hasPrivileges ? 'Yes' : 'No'}`);
          addLog(`  Needs elevation: ${result.needsElevation ? 'Yes' : 'No'}`);
          if (result.method) {
            addLog(`  Elevation method: ${result.method}`);
          }

          if (result.needsElevation) {
            try {
              const descResult =
                await window.electron.secureWipe.getElevationDescription(path);
              if (descResult.success && descResult.description) {
                setElevationDescription(descResult.description);
                addLog(`Elevation method: ${descResult.description}`);
              }
            } catch (error) {
              addLog(
                `Failed to get elevation description: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          } else {
            setElevationDescription('');
          }
        } else {
          addLog(`❌ Privilege check failed: ${result.error}`);
        }
      } catch (error) {
        addLog(
          `❌ Privilege check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        setPrivilegeStatus(null);
      } finally {
        setIsCheckingPrivileges(false);
      }
    },
    [supportsGui],
  );

  // Check GUI prompt support
  const checkGuiSupport = useCallback(async () => {
    try {
      const result: GuiPromptSupport =
        await window.electron.secureWipe.supportsGuiPrompts();
      if (result.success) {
        setSupportsGui(result.supportsGui || false);
        addLog(
          `GUI privilege prompts: ${result.supportsGui ? 'Supported' : 'Not supported'}`,
        );
      }
    } catch (error) {
      addLog(
        `Failed to check GUI prompt support: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }, [addLog]);

  // Initialize system
  useEffect(() => {
    loadSystemInfo();
    loadDrives();
    checkBinaryStatus();
    checkGuiSupport();
  }, [loadSystemInfo, loadDrives, checkBinaryStatus, checkGuiSupport]);

  // Enhanced Binary animation with proper conversion effect
  const generateBinaryAnimation = useCallback(() => {
    if (!isWiping) {
      setBinaryAnimation('');
      setAnimationPhase('');
      return;
    }

    let currentPhase = 0; // 0: original data, 1: random overwrite, 2: zeros, 3: ones, 4: final zeros
    let frameCount = 0;
    const FRAMES_PER_PHASE = 80; // Longer phases for better visibility
    const BINARY_LENGTH = 96; // Optimized length for better display

    const phaseDescriptions = [
      '🔍 Scanning original data patterns...',
      '🎲 Overwriting with cryptographic random data...',
      '⚡ Converting all bits to zeros...',
      '🔄 Writing ones pattern for verification...',
      '✅ Final zero pass - Data permanently destroyed!',
    ];

    // Generate initial "data" pattern
    const originalData = Array.from({ length: BINARY_LENGTH }, (_, i) => {
      // Create a pattern that looks like real data
      const patterns = [
        '10110100',
        '01001011',
        '11010010',
        '00101101',
        '10011010',
      ];
      return patterns[i % patterns.length][i % 8];
    }).join('');

    const animateBinary = () => {
      frameCount++;
      let currentBinary = '';

      // Update phase description
      setAnimationPhase(phaseDescriptions[currentPhase] || 'Processing...');

      switch (currentPhase) {
        case 0: // Show original data
          currentBinary = originalData;
          if (frameCount >= FRAMES_PER_PHASE) {
            currentPhase = 1;
            frameCount = 0;
          }
          break;

        case 1: // Random overwrite phase (simulating secure deletion)
          currentBinary = Array.from({ length: BINARY_LENGTH }, () =>
            Math.random() > 0.5 ? '1' : '0',
          ).join('');
          if (frameCount >= FRAMES_PER_PHASE * 3) {
            // Much longer random phase
            currentPhase = 2;
            frameCount = 0;
          }
          break;

        case 2: // Gradual conversion to zeros
          const zerosProgress = Math.min(frameCount / FRAMES_PER_PHASE, 1);
          const zerosCount = Math.floor(BINARY_LENGTH * zerosProgress);
          currentBinary =
            '0'.repeat(zerosCount) +
            Array.from({ length: BINARY_LENGTH - zerosCount }, () =>
              Math.random() > 0.7 ? '1' : '0',
            ).join('');
          if (frameCount >= FRAMES_PER_PHASE) {
            currentPhase = 3;
            frameCount = 0;
          }
          break;

        case 3: // Ones phase
          currentBinary = '1'.repeat(BINARY_LENGTH);
          if (frameCount >= FRAMES_PER_PHASE) {
            // Full ones phase
            currentPhase = 4;
            frameCount = 0;
          }
          break;

        case 4: // Final zeros with completion effect
          const finalProgress = Math.min(frameCount / FRAMES_PER_PHASE, 1);
          const finalZerosCount = Math.floor(BINARY_LENGTH * finalProgress);
          currentBinary =
            '0'.repeat(finalZerosCount) +
            '1'.repeat(BINARY_LENGTH - finalZerosCount);
          if (frameCount >= FRAMES_PER_PHASE) {
            // Reset for continuous loop
            currentPhase = 0;
            frameCount = 0;
          }
          break;

        default:
          currentBinary = '0'.repeat(BINARY_LENGTH);
      }

      // Add visual separators every 8 bits for readability
      const formattedBinary =
        currentBinary.match(/.{1,8}/g)?.join(' ') || currentBinary;
      setBinaryAnimation(formattedBinary);
    };

    const interval = setInterval(animateBinary, 120); // Slower 120ms intervals for better visibility
    return () => clearInterval(interval);
  }, [isWiping]);

  useEffect(() => {
    const cleanup = generateBinaryAnimation();
    return cleanup;
  }, [generateBinaryAnimation]);

  // Operations
  const handleStartDemo = async () => {
    setIsWiping(true);
    setProgress(null);
    addLog('🚀 Starting demo wipe...');

    const config: SecureWipeConfig = {
      target: `demo-${Date.now()}.tmp`,
      algorithm: 'random',
      bufferSize: 8, // Very small buffer for much slower progress
      demo: true,
      demoSize: Math.max(demoSize, 500), // Minimum 500MB for very long demo
      passes: 1,
    };

    try {
      const result: SecureWipeResult =
        await window.electron.secureWipe.wipe(config);
      if (!result.success) {
        addLog(`❌ Demo failed: ${result.error}`);
        setIsWiping(false);
      }
    } catch (error) {
      addLog(
        `❌ Demo error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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

    // For Windows drives, keep the full device path format
    let formattedTarget = targetPath;
    addLog(`📝 Using target path: ${formattedTarget}`);

    // Check if this is a device path and warn user
    if (
      formattedTarget.startsWith('\\\\.\\') &&
      formattedTarget.endsWith(':')
    ) {
      addLog(`⚠️ WARNING: Attempting to wipe entire drive ${formattedTarget}`);
      addLog(`⚠️ This will permanently erase ALL data on the drive!`);
    }

    const config: SecureWipeConfig = {
      target: formattedTarget,
      algorithm,
      bufferSize,
      passes: useCustomPasses ? customPasses : undefined,
    };

    try {
      // Always use privilege-aware wipe for better handling
      addLog(
        `🔐 Using privilege-aware wipe with automatic privilege detection`,
      );

      if (privilegeStatus?.needsElevation && requestPrivileges) {
        addLog('⚠️ Admin privileges will be requested');
        if (elevationDescription) {
          addLog(`   ${elevationDescription}`);
        }
        if (!supportsGui) {
          addLog('   Note: Console-based privilege prompt (no GUI)');
        }
      }

      const privilegeConfig = {
        ...config,
        requestPrivileges:
          requestPrivileges || privilegeStatus?.needsElevation || false,
        privilegeOptions: {
          name: 'Secure Wipe',
          windowsHide: true,
        },
      };

      addLog(`Configuration: ${JSON.stringify(privilegeConfig, null, 2)}`);

      const result: PrivilegeAwareWipeResult =
        await window.electron.secureWipe.wipeWithPrivileges(privilegeConfig);

      if (result.success) {
        addLog('✅ Privilege-aware wipe completed successfully!');
        if (result.privilegesRequested) {
          addLog(
            `   Privileges were requested using: ${result.privilegeMethod}`,
          );
        }
      } else {
        addLog(`❌ Privilege-aware wipe failed: ${result.error}`);
        if (result.privilegeError) {
          addLog(`   Privilege error: ${result.privilegeError}`);
        }
        setIsWiping(false);
      }
    } catch (error) {
      addLog(
        `❌ Wipe error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      setIsWiping(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    addLog('⏹️ Cancelling operation...');

    try {
      const result: SecureWipeResult =
        await window.electron.secureWipe.cancel();
      if (result.success) {
        addLog('✅ Operation cancelled');
        setIsWiping(false);
        setProgress(null);
      } else {
        addLog(`❌ Cancel failed: ${result.error}`);
      }
    } catch (error) {
      addLog(
        `❌ Cancel error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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
      } else if (event.type === 'error') {
        setIsWiping(false);
        addLog(`❌ Wipe failed: ${(event as ErrorEvent).message}`);
      } else if (event.type === 'progress') {
        const progressEvent = event as SecureWipeProgressEvent;
        addLog(
          `📊 Progress: ${progressEvent.percent}% - Pass ${progressEvent.pass}/${progressEvent.total_passes}`,
        );
      } else if (event.type === 'demo_file_creating') {
        const demoCreatingEvent = event as DemoFileCreatingEvent;
        addLog(
          `📁 Creating demo file: ${Math.round(demoCreatingEvent.percent)}% complete`,
        );
      } else if (event.type === 'demo_file_created') {
        const demoCreatedEvent = event as DemoFileCreatedEvent;
        addLog(`✅ Demo file created: ${demoCreatedEvent.size_mb}MB`);
      } else if (event.type === 'start') {
        const startEvent = event as StartEvent;
        addLog(
          `🚀 Starting ${startEvent.algorithm} algorithm (${startEvent.total_passes} pass${startEvent.total_passes > 1 ? 'es' : ''})`,
        );
      } else if (event.type === 'pass_start') {
        const passStartEvent = event as PassStartEvent;
        addLog(
          `🔄 Pass ${passStartEvent.pass}/${passStartEvent.total_passes} started - Pattern: ${passStartEvent.pattern}`,
        );
      } else if (event.type === 'pass_complete') {
        const passCompleteEvent = event as PassCompleteEvent;
        addLog(
          `✅ Pass ${passCompleteEvent.pass}/${passCompleteEvent.total_passes} completed`,
        );
      } else if (event.type === 'info') {
        const infoEvent = event as InfoEvent;
        addLog(`ℹ️ ${infoEvent.message}`);
      }
    };

    const cleanup = window.electron.secureWipe.onProgress(handleProgress);
    return () => {
      cleanup();
    };
  }, [addLog]);

  // Auto-check privileges when target changes
  useEffect(() => {
    if (targetPath.trim()) {
      checkPrivileges(targetPath);
    }
  }, [targetPath, checkPrivileges]);

  return (
    <div className="secure-wipe-container">
      <div className="main-container">
        <div className="container-header">
          <h1 className="container-title">Secure Data Wipe Tool</h1>
          <p className="container-subtitle">
            Permanently erase files and drives with military-grade security
          </p>
        </div>

        <div className="main-content">
          {/* Left Panel - System Information */}
          <div className="panel">
            <div className="card">
              <h3 className="card-title">System Information</h3>
              <div className="system-info">
                <div className="info-row">
                  <span className="info-label">Operating System</span>
                  <span className="info-value">
                    {isLoadingSystem
                      ? '🔄 Loading...'
                      : systemInfo?.os_name || 'Unknown'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Architecture</span>
                  <span className="info-value">
                    {isLoadingSystem
                      ? '🔄 Loading...'
                      : systemInfo?.architecture || 'Unknown'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Current User</span>
                  <span className="info-value">
                    {isLoadingSystem
                      ? '🔄 Loading...'
                      : systemInfo?.username || 'Unknown'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Hostname</span>
                  <span className="info-value">
                    {isLoadingSystem
                      ? '🔄 Loading...'
                      : systemInfo?.hostname || 'Unknown'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Binary Status</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {isLoadingBinary ? (
                      <span className="info-value">🔄 Checking...</span>
                    ) : (
                      <>
                        <span
                          className={`info-value ${binaryStatus?.binaryStatus?.exists ? 'success' : 'error'}`}
                        >
                          {binaryStatus?.binaryStatus?.exists
                            ? 'Ready'
                            : 'Not Found'}
                        </span>
                        {!binaryStatus?.binaryStatus?.exists && (
                          <button
                            className="button secondary"
                            onClick={checkBinaryStatus}
                            disabled={isLoadingBinary}
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            Find Binary
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="info-row">
                  <span className="info-label">Available Drives</span>
                  <span className="info-value">
                    {isLoadingDrives
                      ? '🔄 Loading...'
                      : `${drives.length} detected`}
                  </span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">Target Selection</h3>
              <div className="form-group">
                <label className="form-label">
                  Enter target path or select from drives below:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="Enter file path or drive (e.g., C:\file.txt or \\.\C:)"
                  disabled={isWiping}
                />
              </div>

              <div className="drive-list">
                {drives.length === 0 ? (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: '#6b7280',
                    }}
                  >
                    Loading drives...
                  </div>
                ) : (
                  drives.map((drive, index) => (
                    <div
                      key={index}
                      className={`drive-item ${targetPath === drive.path ? 'selected' : ''}`}
                      onClick={() => setTargetPath(drive.path)}
                    >
                      <div className="drive-path">{drive.path}</div>
                      <div className="drive-desc">{drive.description}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Center Panel - Configuration */}
          <div className="panel">
            <div className="card">
              <h3 className="card-title">Wipe Algorithm</h3>
              <div className="form-group">
                <label className="form-label">Choose security level:</label>
                <select
                  className="form-select"
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as any)}
                  disabled={isWiping}
                >
                  <option value="random">
                    Random Overwrite (1 pass) - Fast
                  </option>
                  <option value="dod5220">
                    DoD 5220.22-M (3 passes) - Standard
                  </option>
                  <option value="gutmann">
                    Gutmann Method (35 passes) - Maximum Security
                  </option>
                  <option value="zeros">Zero Fill (1 pass) - Basic</option>
                  <option value="ones">One Fill (1 pass) - Basic</option>
                </select>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">Advanced Settings</h3>
              <div className="form-group">
                <label className="form-label">Buffer Size (KB):</label>
                <input
                  type="number"
                  className="form-input"
                  value={bufferSize}
                  onChange={(e) =>
                    setBufferSize(parseInt(e.target.value) || 1024)
                  }
                  min="1"
                  max="10240"
                  disabled={isWiping}
                />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Higher values may improve performance but use more memory
                </small>
              </div>
              <div className="form-group">
                <label className="form-label">Demo File Size (MB):</label>
                <input
                  type="number"
                  className="form-input"
                  value={demoSize}
                  onChange={(e) => setDemoSize(parseInt(e.target.value) || 10)}
                  min="1"
                  max="100"
                  disabled={isWiping}
                />
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Size of temporary file created for safe testing
                </small>
              </div>
            </div>

            {/* Privilege Status Card */}
            {targetPath.trim() && privilegeStatus && (
              <div className="card">
                <h3 className="card-title">Current Privilege Status</h3>
                <div className="system-info">
                  <div className="info-row">
                    <span className="info-label">Current User:</span>
                    <span className="info-value">
                      {privilegeStatus.currentUser}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">User Type:</span>
                    <span
                      className={`info-value ${privilegeStatus.isRoot ? 'success' : ''}`}
                    >
                      {privilegeStatus.isRoot
                        ? '👑 Administrator'
                        : '👤 Regular User'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Platform:</span>
                    <span className="info-value">
                      {privilegeStatus.platform}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Has Privileges:</span>
                    <span
                      className={`info-value ${privilegeStatus.hasPrivileges ? 'success' : 'error'}`}
                    >
                      {privilegeStatus.hasPrivileges ? '✅ Yes' : '⚠️ No'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Needs Elevation:</span>
                    <span
                      className={`info-value ${privilegeStatus.needsElevation ? 'error' : 'success'}`}
                    >
                      {privilegeStatus.needsElevation ? '⚠️ Yes' : '✅ No'}
                    </span>
                  </div>
                  {privilegeStatus.method && (
                    <div className="info-row">
                      <span className="info-label">Elevation Method:</span>
                      <span className="info-value">
                        {privilegeStatus.method}
                      </span>
                    </div>
                  )}
                </div>

                {privilegeStatus.needsElevation && (
                  <div style={{ marginTop: '16px' }}>
                    <div
                      style={{
                        background: '#fef3c7',
                        border: '1px solid #f59e0b',
                        borderRadius: '6px',
                        padding: '12px',
                        marginBottom: '12px',
                      }}
                    >
                      <h4
                        style={{
                          margin: '0 0 8px 0',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#92400e',
                        }}
                      >
                        ⚠️ Admin Privileges Required
                      </h4>
                      <p
                        style={{
                          margin: '0',
                          fontSize: '13px',
                          lineHeight: '1.4',
                          color: '#92400e',
                        }}
                      >
                        This operation requires administrator privileges to
                        access the target path.
                        {elevationDescription && (
                          <>
                            <br />
                            <strong>Elevation method:</strong>{' '}
                            {elevationDescription}
                          </>
                        )}
                      </p>
                      {!supportsGui && (
                        <p
                          style={{
                            margin: '8px 0 0 0',
                            fontSize: '13px',
                            fontStyle: 'italic',
                            opacity: '0.9',
                            color: '#92400e',
                          }}
                        >
                          <strong>Note:</strong> Your system will use
                          console-based authentication (no graphical dialog).
                        </p>
                      )}
                    </div>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={requestPrivileges}
                        onChange={(e) => setRequestPrivileges(e.target.checked)}
                        style={{ marginRight: '8px' }}
                        disabled={isWiping}
                      />
                      <span style={{ fontSize: '0.875rem' }}>
                        Request admin privileges automatically
                      </span>
                    </label>
                    <small
                      style={{
                        color: '#6b7280',
                        fontSize: '0.75rem',
                        marginTop: '4px',
                        lineHeight: '1.4',
                        display: 'block',
                      }}
                    >
                      When enabled, the application will automatically request
                      admin privileges if needed. When disabled, the operation
                      may fail if privileges are required.
                    </small>
                  </div>
                )}
              </div>
            )}

            {targetPath.trim() && isCheckingPrivileges && (
              <div className="card">
                <h3 className="card-title">Checking Privileges...</h3>
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#6b7280',
                  }}
                >
                  🔄 Analyzing privilege requirements for the target path...
                </div>
              </div>
            )}

            <div className="card">
              <h3 className="card-title">Actions</h3>
              <div className="actions">
                <button
                  className="button success"
                  onClick={handleStartDemo}
                  disabled={!binaryStatus?.binaryStatus?.exists || isWiping}
                >
                  🛡️ Run Safe Demo ({demoSize}MB)
                </button>
                <button
                  className="button primary"
                  onClick={handleStartWipe}
                  disabled={
                    !targetPath ||
                    !binaryStatus?.binaryStatus?.exists ||
                    isWiping
                  }
                >
                  {privilegeStatus?.needsElevation && requestPrivileges
                    ? '🔐 Start Wipe (with privileges)'
                    : '🔥 Start Secure Wipe'}
                </button>
                {isWiping && (
                  <button
                    className="button danger"
                    onClick={handleCancel}
                    disabled={isCancelling}
                  >
                    {isCancelling ? '⏳ Cancelling...' : '⏹️ Cancel Operation'}
                  </button>
                )}
              </div>

              {privilegeStatus?.needsElevation && !requestPrivileges && (
                <div
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '6px',
                    padding: '16px',
                    marginTop: '16px',
                    fontSize: '0.875rem',
                    color: '#92400e',
                  }}
                >
                  <strong>Warning:</strong> Admin privileges are required for
                  this target, but automatic privilege requests are disabled.
                  The operation may fail.
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Progress & Activity */}
          <div className="panel">
            {isWiping && (
              <div className="card">
                <h3 className="card-title">Wipe Progress</h3>
                <div className="progress-container">
                  <div className="progress-info">
                    <div className="progress-title">
                      🔥 Secure Wipe in Progress
                    </div>
                    <div className="progress-subtitle">
                      Using {algorithm.toUpperCase()} algorithm on: {targetPath}
                    </div>
                    {animationPhase && (
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: '#3b82f6',
                          fontWeight: '500',
                          marginTop: '8px',
                        }}
                      >
                        {animationPhase}
                      </div>
                    )}
                  </div>

                  {progress && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${
                            progress.type === 'progress'
                              ? (progress as SecureWipeProgressEvent).percent
                              : progress.type === 'demo_file_creating'
                                ? (progress as DemoFileCreatingEvent).percent
                                : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  )}

                  <div className="binary-animation">
                    <div className="binary-animation-text">
                      {binaryAnimation || 'Initializing secure wipe process...'}
                    </div>
                  </div>

                  {progress && (
                    <div
                      style={{
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                      }}
                    >
                      {progress.type === 'progress'
                        ? `${(progress as SecureWipeProgressEvent).percent}% Complete - Pass ${(progress as SecureWipeProgressEvent).pass}/${(progress as SecureWipeProgressEvent).total_passes}`
                        : progress.type === 'demo_file_creating'
                          ? `Creating Demo File: ${Math.round((progress as DemoFileCreatingEvent).percent)}% Complete`
                          : 'Processing...'}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="card">
              <div className="log-header">
                <h3 className="card-title" style={{ margin: 0 }}>
                  Activity Log
                </h3>
                <button
                  className="button secondary"
                  onClick={() => setLogs([])}
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  Clear Log
                </button>
              </div>

              <div className="log-container">
                {logs.length === 0 ? (
                  <div
                    style={{
                      color: '#6b7280',
                      fontStyle: 'italic',
                      padding: '20px',
                      textAlign: 'center',
                    }}
                  >
                    No activity yet. Operations will be logged here.
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
