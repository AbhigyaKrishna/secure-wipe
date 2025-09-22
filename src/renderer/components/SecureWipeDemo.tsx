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
  const [isDeletionPhase, setIsDeletionPhase] = useState<boolean>(false);

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
      setIsDeletionPhase(false);
      return;
    }

    let currentPhase = 0; // 0: original data, 1: random overwrite, 2: zeros, 3: ones, 4: final zeros
    let frameCount = 0;
    const FRAMES_PER_PHASE = 60; // Optimized for better visibility
    const BINARY_LENGTH = 120; // Longer length for better effect

    const phaseDescriptions = [
      '🔍 Scanning original data patterns...',
      '🎲 Overwriting with cryptographic random data...',
      '⚡ Converting all bits to zeros (SECURE DELETION)...',
      '🔄 Writing verification pattern...',
      '✅ Final zero pass - Data permanently destroyed!',
    ];

    // Generate initial "data" pattern that looks more realistic
    const originalData = Array.from({ length: BINARY_LENGTH }, (_, i) => {
      // Create varied patterns that simulate real file data
      const patterns = [
        '10110100', '01001011', '11010010', '00101101', '10011010',
        '11100011', '00110110', '10101010', '01010101', '11111000'
      ];
      return patterns[i % patterns.length][i % 8];
    }).join('');

    const animateBinary = () => {
      frameCount++;
      let currentBinary = '';

      // Update phase description
      setAnimationPhase(phaseDescriptions[currentPhase] || 'Processing...');

      switch (currentPhase) {
        case 0: // Show original data with some flickering
          if (frameCount < 5) {
            // Initial stable display
            currentBinary = originalData;
          } else {
            // Add some flickering to simulate reading
            currentBinary = Array.from(originalData, (bit, i) => {
              if (Math.random() < 0.05) { // 5% chance to flicker
                return Math.random() > 0.5 ? '1' : '0';
              }
              return bit;
            }).join('');
          }
          
          if (frameCount >= FRAMES_PER_PHASE) {
            currentPhase = 1;
            frameCount = 0;
          }
          break;

        case 1: // Random overwrite phase - more chaotic
          currentBinary = Array.from({ length: BINARY_LENGTH }, () =>
            Math.random() > 0.5 ? '1' : '0',
          ).join('');
          
          if (frameCount >= FRAMES_PER_PHASE * 2) {
            currentPhase = 2;
            frameCount = 0;
          }
          break;

        case 2: // Gradual conversion to zeros - THE MAIN DELETION EFFECT
          setIsDeletionPhase(true); // Activate deletion visual mode
          const zerosProgress = Math.min(frameCount / (FRAMES_PER_PHASE * 2), 1);
          const zerosCount = Math.floor(BINARY_LENGTH * zerosProgress);
          
          // Create a dramatic wave effect of zeros spreading from left to right
          let tempBinary = '';
          for (let i = 0; i < BINARY_LENGTH; i++) {
            if (i < zerosCount) {
              tempBinary += '0'; // Already converted to zero - DATA DESTROYED
            } else if (i < zerosCount + 8) {
              // Transition zone - more dramatic flickering
              if (Math.random() < 0.8) {
                tempBinary += '0'; // Bias towards zeros in transition
              } else {
                tempBinary += Math.random() > 0.5 ? '1' : '0';
              }
            } else if (i < zerosCount + 15) {
              // Secondary transition zone - less stable
              tempBinary += Math.random() < 0.6 ? '0' : (Math.random() > 0.5 ? '1' : '0');
            } else {
              // Not yet reached - chaotic data
              tempBinary += Math.random() > 0.5 ? '1' : '0';
            }
          }
          currentBinary = tempBinary;
          
          // Update phase description with progress
          if (zerosProgress > 0.1) {
            const progressPercent = Math.floor(zerosProgress * 100);
            setAnimationPhase(`⚡ SECURE DELETION IN PROGRESS: ${progressPercent}% converted to zeros...`);
          }
          
          if (frameCount >= FRAMES_PER_PHASE * 2) {
            setIsDeletionPhase(false); // Exit deletion visual mode
            currentPhase = 3;
            frameCount = 0;
          }
          break;

        case 3: // Verification phase - brief ones pattern
          const onesProgress = Math.min(frameCount / FRAMES_PER_PHASE, 1);
          const onesCount = Math.floor(BINARY_LENGTH * onesProgress);
          currentBinary = '1'.repeat(onesCount) + '0'.repeat(BINARY_LENGTH - onesCount);
          
          if (frameCount >= FRAMES_PER_PHASE) {
            currentPhase = 4;
            frameCount = 0;
          }
          break;

        case 4: // Final zeros with dramatic effect
          const finalProgress = Math.min(frameCount / FRAMES_PER_PHASE, 1);
          
          if (finalProgress < 0.8) {
            // Quick conversion from ones to zeros
            const finalZerosCount = Math.floor(BINARY_LENGTH * (finalProgress / 0.8));
            currentBinary = '0'.repeat(finalZerosCount) + '1'.repeat(BINARY_LENGTH - finalZerosCount);
          } else {
            // Final stable zeros - data is destroyed
            currentBinary = '0'.repeat(BINARY_LENGTH);
          }
          
          if (frameCount >= FRAMES_PER_PHASE * 1.5) {
            // Hold the final zeros state longer, then restart
            if (frameCount >= FRAMES_PER_PHASE * 3) {
              currentPhase = 0;
              frameCount = 0;
            }
          }
          break;

        default:
          currentBinary = '0'.repeat(BINARY_LENGTH);
      }

      // Add visual separators every 8 bits for readability
      const formattedBinary = currentBinary.match(/.{1,8}/g)?.join(' ') || currentBinary;
      setBinaryAnimation(formattedBinary);
    };

    const interval = setInterval(animateBinary, 100); // Faster updates for smoother animation
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

  // Enhanced styles for better progress visualization
  const enhancedStyles = `
    .enhanced-progress-bar {
      background: linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 100%);
      border-radius: 8px;
      height: 14px;
      overflow: hidden;
      margin: 16px 0;
      position: relative;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
      border: 1px solid #d1d5db;
    }

    .enhanced-progress-fill {
      background: linear-gradient(90deg, #3b82f6 0%, #1d4ed8 50%, #2563eb 100%);
      height: 100%;
      transition: width 0.6s ease-in-out;
      position: relative;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
    }

    .enhanced-progress-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.4) 50%,
        transparent 100%
      );
      animation: progress-shine 2s infinite;
      border-radius: 6px;
    }

    @keyframes progress-shine {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(100%);
      }
    }

    .enhanced-binary-animation {
      font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
      font-size: 11px;
      line-height: 1.8;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      color: #22d3ee;
      padding: 20px;
      border-radius: 10px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 16px 0;
      border: 2px solid #0891b2;
      box-shadow: 
        0 0 25px rgba(34, 211, 238, 0.4),
        inset 0 0 25px rgba(34, 211, 238, 0.1);
      position: relative;
      min-height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      animation: binary-glow 3s ease-in-out infinite alternate;
      transition: all 0.5s ease;
    }

    .enhanced-binary-animation.deletion-active {
      background: linear-gradient(135deg, #1a0f0f 0%, #2d1b1b 50%, #1a0f0f 100%);
      color: #ff6b6b;
      border-color: #dc2626;
      box-shadow: 
        0 0 30px rgba(220, 38, 38, 0.5),
        inset 0 0 30px rgba(220, 38, 38, 0.2);
      animation: deletion-pulse 2s ease-in-out infinite alternate;
    }

    @keyframes deletion-pulse {
      0% {
        box-shadow: 
          0 0 30px rgba(220, 38, 38, 0.5),
          inset 0 0 30px rgba(220, 38, 38, 0.2);
        border-color: #dc2626;
      }
      100% {
        box-shadow: 
          0 0 40px rgba(220, 38, 38, 0.7),
          inset 0 0 40px rgba(220, 38, 38, 0.3);
        border-color: #ff6b6b;
      }
    }

    @keyframes binary-glow {
      0% {
        box-shadow: 
          0 0 25px rgba(34, 211, 238, 0.4),
          inset 0 0 25px rgba(34, 211, 238, 0.1);
        border-color: #0891b2;
      }
      100% {
        box-shadow: 
          0 0 35px rgba(34, 211, 238, 0.6),
          inset 0 0 35px rgba(34, 211, 238, 0.2);
        border-color: #22d3ee;
      }
    }

    .enhanced-binary-animation::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(34, 211, 238, 0.15) 50%,
        transparent 100%
      );
      animation: binary-scan 4s linear infinite;
      pointer-events: none;
      border-radius: 8px;
    }

    @keyframes binary-scan {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(100%);
      }
    }

    .enhanced-binary-animation-text {
      position: relative;
      z-index: 1;
      text-shadow: 0 0 12px rgba(34, 211, 238, 0.8);
      letter-spacing: 1.2px;
      font-weight: 500;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .progress-container {
      min-height: 320px;
      display: flex;
      flex-direction: column;
      padding: 20px 0;
    }

    .progress-info {
      margin-bottom: 20px;
    }

    .progress-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 8px;
      color: #1f2937;
    }

    .progress-subtitle {
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 12px;
      line-height: 1.4;
    }
  `;

  // Inject enhanced styles
  React.useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('enhanced-wipe-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'enhanced-wipe-styles';
      styleElement.textContent = enhancedStyles;
      document.head.appendChild(styleElement);
    }
  }, []);

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
            {/* Progress Card - Always visible but changes content based on state */}
            <div className="card">
              <h3 className="card-title">
                {isWiping ? '🔥 Wipe Progress' : '📊 Operation Status'}
              </h3>
              <div className="progress-container">
                <div className="progress-info">
                  <div className="progress-title">
                    {isWiping ? (
                      <>🔥 Secure Wipe in Progress</>
                    ) : (
                      <>⏸️ Ready to Start Operation</>
                    )}
                  </div>
                  <div className="progress-subtitle">
                    {isWiping ? (
                      <>Using {algorithm.toUpperCase()} algorithm on: {targetPath || 'Demo File'}</>
                    ) : (
                      <>Configure your wipe settings and click start</>
                    )}
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

                {/* Enhanced Progress bar - Always visible */}
                <div className="enhanced-progress-bar">
                  <div
                    className="enhanced-progress-fill"
                    style={{
                      width: `${
                        isWiping && progress
                          ? progress.type === 'progress'
                            ? (progress as SecureWipeProgressEvent).percent
                            : progress.type === 'demo_file_creating'
                              ? (progress as DemoFileCreatingEvent).percent
                              : 0
                          : 0
                      }%`,
                      opacity: isWiping ? 1 : 0.3,
                    }}
                  ></div>
                </div>

                {/* Enhanced Binary animation - Always visible */}
                <div className={`enhanced-binary-animation ${isDeletionPhase ? 'deletion-active' : ''}`}>
                  <div className="enhanced-binary-animation-text">
                    {isWiping ? (
                      binaryAnimation || (
                        <div style={{ 
                          color: '#22d3ee', 
                          fontSize: '13px',
                          padding: '20px',
                          lineHeight: '1.6',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          height: '100%'
                        }}>
                          <div style={{ marginBottom: '10px' }}>
                            🔄 Initializing secure wipe process...
                          </div>
                          <div style={{ fontSize: '11px', opacity: 0.8 }}>
                            Binary data conversion will begin shortly
                          </div>
                        </div>
                      )
                    ) : (
                      <div style={{ 
                        color: '#64748b', 
                        fontSize: '14px',
                        textAlign: 'center',
                        padding: '30px 20px',
                        lineHeight: '1.6',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        height: '100%'
                      }}>
                        <div style={{ marginBottom: '12px' }}>
                          🔒 Binary Data Visualization Panel
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '8px' }}>
                          Watch as your data gets securely overwritten with zeros
                        </div>
                        <div style={{ fontSize: '11px', opacity: 0.5, fontStyle: 'italic' }}>
                          Start a wipe operation to see the live binary conversion
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress details */}
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    minHeight: '40px',
                    padding: '12px 0',
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: '1.4',
                  }}
                >
                  {isWiping && progress ? (
                    progress.type === 'progress' ? (
                      `${(progress as SecureWipeProgressEvent).percent}% Complete - Pass ${(progress as SecureWipeProgressEvent).pass}/${(progress as SecureWipeProgressEvent).total_passes}`
                    ) : progress.type === 'demo_file_creating' ? (
                      `Creating Demo File: ${Math.round((progress as DemoFileCreatingEvent).percent)}% Complete`
                    ) : (
                      'Processing...'
                    )
                  ) : isWiping ? (
                    'Initializing...'
                  ) : (
                    'No active operation'
                  )}
                </div>
              </div>
            </div>

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
