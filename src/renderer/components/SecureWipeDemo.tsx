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
  const [animationPhase, setAnimationPhase] = useState<string>('');
  
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
        addLog(`✅ System info loaded: ${result.systemInfo.os_name} ${result.systemInfo.architecture}`);
        
        // Extract drives from system info as backup
        if (result.systemInfo.storage_devices && result.systemInfo.storage_devices.length > 0) {
          const mappedDrives = result.systemInfo.storage_devices.map(device => ({
            path: device.device_path,
            drive_type: 'disk' as const,
            size_bytes: device.size_bytes,
            size_gb: Math.round(device.size_bytes / (1024 * 1024 * 1024) * 100) / 100,
            description: `${device.mount_point} (${device.file_system}) - ${Math.round(device.size_bytes / (1024 * 1024 * 1024) * 100) / 100} GB`
          }));
          setDrives(mappedDrives);
          addLog(`✅ Found ${mappedDrives.length} drives from system info`);
        }
      } else {
        addLog(`❌ Failed to load system info: ${result.error}`);
      }
    } catch (error) {
      addLog(`❌ System info error: ${error}`);
    }
  }, []);

  // Load drives using proper API (with fallback to system info)
  const loadDrives = useCallback(async () => {
    try {
      addLog('🔍 Attempting to load drives via drive list API...');
      const result: DriveListResult = await window.electron.secureWipe.listDrives();
      addLog(`📋 Drive list API result: ${JSON.stringify(result)}`);
      
      if (result.success && result.drives && result.drives.length > 0) {
        setDrives(result.drives);
        addLog(`✅ Found ${result.drives.length} drives via drive list API`);
      } else {
        addLog(`⚠️ Drive list API failed: ${result.error || 'No drives returned'}, using system info drives`);
        // Drives should already be loaded from system info as fallback
      }
    } catch (error) {
      addLog(`⚠️ Drive list API error: ${error}, using system info drives`);
      // Drives should already be loaded from system info as fallback
    }
  }, []);


  // Check binary status
  const checkBinaryStatus = useCallback(async () => {
    try {
      addLog('🔍 Checking binary status...');
      const result: BinaryCheckResult = await window.electron.secureWipe.checkBinary();
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
            addLog(`✅ Binary found automatically: ${findResult.binaryStatus?.path}`);
          }
        } catch (findError) {
          addLog(`❌ Auto-find binary error: ${findError}`);
        }
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
        addLog(`  Current user: ${result.currentUser} (${result.isRoot ? 'admin' : 'regular user'})`);
        addLog(`  Platform: ${result.platform}`);
        addLog(`  Has privileges: ${result.hasPrivileges ? 'Yes' : 'No'}`);
        addLog(`  Needs elevation: ${result.needsElevation ? 'Yes' : 'No'}`);
        if (result.method) {
          addLog(`  Elevation method: ${result.method}`);
        }
        
        if (result.needsElevation) {
          try {
            const descResult = await window.electron.secureWipe.getElevationDescription(path);
            if (descResult.success && descResult.description) {
              setElevationDescription(descResult.description);
              addLog(`Elevation method: ${descResult.description}`);
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
      '✅ Final zero pass - Data permanently destroyed!'
    ];

    // Generate initial "data" pattern
    const originalData = Array.from({ length: BINARY_LENGTH }, (_, i) => {
      // Create a pattern that looks like real data
      const patterns = ['10110100', '01001011', '11010010', '00101101', '10011010'];
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
            Math.random() > 0.5 ? '1' : '0'
          ).join('');
          if (frameCount >= FRAMES_PER_PHASE * 3) { // Much longer random phase
            currentPhase = 2;
            frameCount = 0;
          }
          break;

        case 2: // Gradual conversion to zeros
          const zerosProgress = Math.min(frameCount / FRAMES_PER_PHASE, 1);
          const zerosCount = Math.floor(BINARY_LENGTH * zerosProgress);
          currentBinary = '0'.repeat(zerosCount) + 
            Array.from({ length: BINARY_LENGTH - zerosCount }, () =>
              Math.random() > 0.7 ? '1' : '0'
            ).join('');
          if (frameCount >= FRAMES_PER_PHASE) {
            currentPhase = 3;
            frameCount = 0;
          }
          break;

        case 3: // Ones phase
          currentBinary = '1'.repeat(BINARY_LENGTH);
          if (frameCount >= FRAMES_PER_PHASE) { // Full ones phase
            currentPhase = 4;
            frameCount = 0;
          }
          break;

        case 4: // Final zeros with completion effect
          const finalProgress = Math.min(frameCount / FRAMES_PER_PHASE, 1);
          const finalZerosCount = Math.floor(BINARY_LENGTH * finalProgress);
          currentBinary = '0'.repeat(finalZerosCount) + 
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
      const formattedBinary = currentBinary.match(/.{1,8}/g)?.join(' ') || currentBinary;
      setBinaryAnimation(formattedBinary);
    };

    const interval = setInterval(animateBinary, 120); // Slower 120ms intervals for better visibility
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
      target: `demo-${Date.now()}.tmp`,
      algorithm: 'random',
      bufferSize: 8, // Very small buffer for much slower progress
      demo: true,
      demoSize: Math.max(demoSize, 500), // Minimum 500MB for very long demo
      passes: 1,
    };

    try {
      const result: SecureWipeResult = await window.electron.secureWipe.wipe(config);
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

    // For Windows drives, keep the full device path format
    let formattedTarget = targetPath;
    addLog(`📝 Using target path: ${formattedTarget}`);

    // Check if this is a device path and warn user
    if (formattedTarget.startsWith('\\\\.\\') && formattedTarget.endsWith(':')) {
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
      addLog(`🔐 Using privilege-aware wipe with automatic privilege detection`);
      
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
        requestPrivileges: requestPrivileges || privilegeStatus?.needsElevation || false,
        privilegeOptions: {
          name: 'Secure Wipe',
          windowsHide: true,
        },
      };
      
      addLog(`Configuration: ${JSON.stringify(privilegeConfig, null, 2)}`);
      
      const result = await window.electron.secureWipe.wipeWithPrivileges(privilegeConfig);
      
      if (result.success) {
        addLog('✅ Privilege-aware wipe completed successfully!');
        if ((result as any).privilegesRequested) {
          addLog(`   Privileges were requested using: ${(result as any).privilegeMethod}`);
        }
      } else {
        addLog(`❌ Privilege-aware wipe failed: ${result.error}`);
        if ((result as any).privilegeError) {
          addLog(`   Privilege error: ${(result as any).privilegeError}`);
        }
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
      const result: SecureWipeResult = await window.electron.secureWipe.cancel();
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
      } else if (event.type === 'error') {
        setIsWiping(false);
        addLog(`❌ Wipe failed: ${(event as any).message}`);
      } else if (event.type === 'progress') {
        addLog(`📊 Progress: ${(event as any).percent}% - Pass ${(event as any).pass}/${(event as any).total_passes}`);
      } else if (event.type === 'demo_file_creating') {
        addLog(`📁 Creating demo file: ${Math.round((event as any).percent)}% complete`);
      } else if (event.type === 'demo_file_created') {
        addLog(`✅ Demo file created: ${(event as any).size_mb}MB`);
      } else if (event.type === 'start') {
        addLog(`🚀 Starting ${(event as any).algorithm} algorithm (${(event as any).total_passes} pass${(event as any).total_passes > 1 ? 'es' : ''})`);
      } else if (event.type === 'pass_start') {
        addLog(`🔄 Pass ${(event as any).pass}/${(event as any).total_passes} started - Pattern: ${(event as any).pattern}`);
      } else if (event.type === 'pass_complete') {
        addLog(`✅ Pass ${(event as any).pass}/${(event as any).total_passes} completed`);
      }
    };

    const cleanup = window.electron.secureWipe.onProgress(handleProgress);
    return () => {
      cleanup();
    };
  }, []);

  // Auto-check privileges when target changes
  useEffect(() => {
    if (targetPath.trim()) {
      checkPrivileges(targetPath);
    }
  }, [targetPath, checkPrivileges]);


  // Clean, user-friendly styles
  const cleanStyles = `
    .secure-wipe-container {
      min-height: 100vh;
      background: #f8fafc;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1f2937;
    }

    .main-container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }

    .container-header {
      background: #374151;
      padding: 24px;
      border-radius: 8px 8px 0 0;
      color: white;
      text-align: center;
    }

    .container-title {
      font-size: 1.875rem;
      font-weight: 700;
      margin: 0 0 8px 0;
    }

    .container-subtitle {
      font-size: 1rem;
      opacity: 0.9;
      margin: 0;
    }

    .main-content {
      padding: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }

    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }

    .system-info {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      font-weight: 500;
      color: #6b7280;
      font-size: 0.875rem;
    }

    .info-value {
      font-weight: 600;
      color: #1f2937;
      font-size: 0.875rem;
    }

    .info-value.success {
      color: #059669;
    }

    .info-value.error {
      color: #dc2626;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
      font-size: 0.875rem;
    }

    .form-input, .form-select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
      color: #1f2937;
    }

    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .drive-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #f9fafb;
    }

    .drive-item {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .drive-item:last-child {
      border-bottom: none;
    }

    .drive-item:hover {
      background: #f3f4f6;
    }

    .drive-item.selected {
      background: #dbeafe;
      border-left: 4px solid #3b82f6;
    }

    .drive-path {
      font-weight: 600;
      color: #1f2937;
      font-size: 0.875rem;
    }

    .drive-desc {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 4px;
    }

    .button {
      padding: 10px 16px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
      text-align: center;
      display: inline-block;
    }

    .button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .button.primary {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .button.primary:hover:not(:disabled) {
      background: #2563eb;
      border-color: #2563eb;
    }

    .button.success {
      background: #059669;
      color: white;
      border-color: #059669;
    }

    .button.success:hover:not(:disabled) {
      background: #047857;
      border-color: #047857;
    }

    .button.danger {
      background: #dc2626;
      color: white;
      border-color: #dc2626;
    }

    .button.danger:hover:not(:disabled) {
      background: #b91c1c;
      border-color: #b91c1c;
    }

    .button.secondary {
      background: white;
      color: #374151;
      border-color: #d1d5db;
    }

    .button.secondary:hover:not(:disabled) {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .progress-container {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px;
      margin: 16px 0;
    }

    .progress-bar {
      background: #e5e7eb;
      border-radius: 4px;
      height: 8px;
      overflow: hidden;
      margin: 12px 0;
    }

    .progress-fill {
      background: #3b82f6;
      height: 100%;
      transition: width 0.3s ease;
    }

    .binary-animation {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.6;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #22d3ee;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 16px 0;
      border: 2px solid #0891b2;
      box-shadow: 
        0 0 20px rgba(34, 211, 238, 0.3),
        inset 0 0 20px rgba(34, 211, 238, 0.1);
      position: relative;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      animation: binary-glow 2s ease-in-out infinite alternate;
    }

    @keyframes binary-glow {
      0% {
        box-shadow: 
          0 0 20px rgba(34, 211, 238, 0.3),
          inset 0 0 20px rgba(34, 211, 238, 0.1);
      }
      100% {
        box-shadow: 
          0 0 30px rgba(34, 211, 238, 0.5),
          inset 0 0 30px rgba(34, 211, 238, 0.2);
      }
    }

    .binary-animation::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(34, 211, 238, 0.1) 50%,
        transparent 100%
      );
      animation: binary-scan 3s linear infinite;
      pointer-events: none;
    }

    @keyframes binary-scan {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(100%);
      }
    }

    .binary-animation-text {
      position: relative;
      z-index: 1;
      text-shadow: 0 0 10px rgba(34, 211, 238, 0.8);
      letter-spacing: 1px;
    }

    .log-container {
      background: #1f2937;
      border-radius: 6px;
      padding: 12px;
      height: 300px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #10b981;
      border: 1px solid #374151;
    }

    .log-entry {
      margin-bottom: 2px;
      word-wrap: break-word;
      line-height: 1.4;
    }

    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .progress-info {
      text-align: center;
      margin-bottom: 12px;
    }

    .progress-title {
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .progress-subtitle {
      font-size: 0.875rem;
      color: #6b7280;
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
        padding: 16px;
        gap: 16px;
      }
      
      .container-header {
        padding: 20px 16px;
      }
      
      .container-title {
        font-size: 1.5rem;
      }
    }
  `;

  // Inject styles
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('clean-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'clean-styles';
      styleElement.textContent = cleanStyles;
      document.head.appendChild(styleElement);
    }
  }, []);

  return (
    <div className="secure-wipe-container">
      <div className="main-container">
        <div className="container-header">
          <h1 className="container-title">Secure Data Wipe Tool</h1>
          <p className="container-subtitle">Permanently erase files and drives with military-grade security</p>
        </div>

        <div className="main-content">
          {/* Left Panel - System Information */}
          <div className="panel">
            <div className="card">
              <h3 className="card-title">System Information</h3>
              <div className="system-info">
                <div className="info-row">
                  <span className="info-label">Operating System</span>
                  <span className="info-value">{systemInfo?.os_name || 'Loading...'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Architecture</span>
                  <span className="info-value">{systemInfo?.architecture || 'Loading...'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Current User</span>
                  <span className="info-value">{systemInfo?.username || 'Loading...'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Hostname</span>
                  <span className="info-value">{systemInfo?.hostname || 'Loading...'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Binary Status</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`info-value ${binaryStatus?.binaryStatus?.exists ? 'success' : 'error'}`}>
                      {binaryStatus?.binaryStatus?.exists ? 'Ready' : 'Not Found'}
                    </span>
                    {!binaryStatus?.binaryStatus?.exists && (
                      <button 
                        className="button secondary"
                        onClick={checkBinaryStatus}
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      >
                        Find Binary
                      </button>
                    )}
                  </div>
                </div>
                <div className="info-row">
                  <span className="info-label">Available Drives</span>
                  <span className="info-value">{drives.length} detected</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">Target Selection</h3>
              <div className="form-group">
                <label className="form-label">Enter target path or select from drives below:</label>
                <input
                  type="text"
                  className="form-input"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="Enter file path or drive (e.g., C:\file.txt or \\.\C:)"
                  disabled={isWiping}
                />
              </div>
              
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '12px', marginBottom: '12px', fontSize: '0.75rem', color: '#92400e' }}>
                ⚠️ <strong>Device Wiping Note:</strong> This binary supports file wiping and demo mode. 
                Physical device wiping may require specialized hardware access or different tools.
                Use demo mode to safely test the secure wipe functionality.
              </div>
              
              <div className="drive-list">
                {drives.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
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
                      <div style={{ fontSize: '0.6rem', color: '#dc2626', marginTop: '2px' }}>
                        ⚠️ Device wiping may not be supported
                      </div>
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
                  <option value="random">Random Overwrite (1 pass) - Fast</option>
                  <option value="dod5220">DoD 5220.22-M (3 passes) - Standard</option>
                  <option value="gutmann">Gutmann Method (35 passes) - Maximum Security</option>
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
                  onChange={(e) => setBufferSize(parseInt(e.target.value) || 1024)}
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

            {privilegeStatus?.needsElevation && (
              <div className="card">
                <h3 className="card-title">Administrator Privileges Required</h3>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={requestPrivileges}
                      onChange={(e) => setRequestPrivileges(e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontSize: '0.875rem' }}>Automatically request admin privileges</span>
                  </label>
                </div>
                <small style={{ color: '#dc2626', fontSize: '0.75rem', display: 'block' }}>
                  ⚠️ This operation requires administrator privileges to access the selected target.
                </small>
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
                  disabled={!targetPath || !binaryStatus?.binaryStatus?.exists || isWiping}
                >
                  🔥 Start Secure Wipe
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
            </div>
          </div>

          {/* Right Panel - Progress & Activity */}
          <div className="panel">
            {isWiping && (
              <div className="card">
                <h3 className="card-title">Wipe Progress</h3>
                <div className="progress-container">
                  <div className="progress-info">
                    <div className="progress-title">🔥 Secure Wipe in Progress</div>
                    <div className="progress-subtitle">
                      Using {algorithm.toUpperCase()} algorithm on: {targetPath}
                    </div>
                    {animationPhase && (
                      <div style={{ fontSize: '0.875rem', color: '#3b82f6', fontWeight: '500', marginTop: '8px' }}>
                        {animationPhase}
                      </div>
                    )}
                  </div>
                  
                  {progress && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${(progress as any).percent || 0}%` }}
                      ></div>
                    </div>
                  )}
                  
                  <div className="binary-animation">
                    <div className="binary-animation-text">
                      {binaryAnimation || 'Initializing secure wipe process...'}
                    </div>
                  </div>
                  
                  {progress && (
                    <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                      {progress.type === 'progress' ? `${(progress as any).percent}% Complete - Pass ${(progress as any).pass}/${(progress as any).total_passes}` : 'Processing...'}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="card">
              <div className="log-header">
                <h3 className="card-title" style={{ margin: 0 }}>Activity Log</h3>
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
                  <div style={{ color: '#6b7280', fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>
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
