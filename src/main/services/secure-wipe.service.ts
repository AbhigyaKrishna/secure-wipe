/**
 * SecureWipeService - Service class for integrating with the secure-wipe binary
 * Handles process spawning, JSON event parsing, and lifecycle management
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import {
  SecureWipeConfig,
  SecureWipeResult,
  SecureWipeEvent,
  SecureWipeServiceOptions,
  ProgressCallback,
  WipeAlgorithm,
  DriveInfo,
  SystemInfo,
  PrivilegeCheckResult,
  PrivilegeEscalationOptions,
  SecureWipeConfigWithPrivileges,
  SecureWipeResultWithPrivileges,
  BinaryAccessValidation,
} from '../types/secure-wipe';
import { SecureWipeUtils } from '../utils/secure-wipe.utils';
import { AdminPrivilegesUtils } from '../utils/admin-privileges.utils';

export class SecureWipeService extends EventEmitter {
  private binaryPath: string;

  private timeout: number;

  private activeProcess: ChildProcess | null = null;

  private timeoutHandle: NodeJS.Timeout | null = null;

  private jsonBuffer: string = ''; // Buffer for accumulating multi-line JSON

  constructor(options: SecureWipeServiceOptions = {}) {
    super();

    // Default binary path - should be in resources or app directory
    this.binaryPath = options.binaryPath || this.getDefaultBinaryPath();
    this.timeout = options.timeout || 300000; // 5 minutes default timeout
  }

  /**
   * Get the default path to the secure-wipe binary
   * Supports both Windows (.exe) and Linux binaries bundled with the app
   */
  private getDefaultBinaryPath(): string {
    const { platform } = process;
    const binaryName = this.getBinaryNameForPlatform(platform);

    // Priority order for bundled Electron apps:
    // 1. Production: process.resourcesPath/assets/
    // 2. Development: relative to main process
    // 3. Development: assets directory
    // 4. Fallback: system PATH
    const possiblePaths = [
      // Production bundled app - resources folder
      ...(process.resourcesPath
        ? [
            path.join(process.resourcesPath, 'assets', binaryName),
            path.join(process.resourcesPath, 'assets', 'bin', binaryName),
          ]
        : []),

      // Development - relative to compiled main process
      path.join(__dirname, '..', '..', '..', 'assets', binaryName),
      path.join(__dirname, '..', '..', '..', 'assets', 'bin', binaryName),

      // Alternative development paths
      path.join(__dirname, '..', '..', 'assets', binaryName),
      path.join(__dirname, '..', '..', 'assets', 'bin', binaryName),

      // Local bin directory
      path.join(__dirname, 'bin', binaryName),

      // System PATH as last resort
      binaryName,
    ];

    for (const binPath of possiblePaths) {
      try {
        if (fs.existsSync(binPath)) {
          const stats = fs.statSync(binPath);
          if (stats.isFile()) {
            console.log(`Found secure-wipe binary at: ${binPath}`);
            return binPath;
          }
        }
      } catch (error) {
        // Continue to next path if this one fails
        continue;
      }
    }

    console.warn(`secure-wipe binary not found. Searched paths:`);
    possiblePaths.forEach((p, i) => console.warn(`  ${i + 1}. ${p}`));
    console.warn('Falling back to system PATH lookup');

    return binaryName; // Fallback to PATH lookup
  }

  /**
   * Get the appropriate binary name for the current platform
   */
  private getBinaryNameForPlatform(platform: string): string {
    switch (platform) {
      case 'win32':
        return 'secure-wipe-bin.exe';
      case 'linux':
        return 'secure-wipe-bin';
      case 'darwin':
        return 'secure-wipe-bin'; // macOS binary (if you add it later)
      default:
        console.warn(
          `Unsupported platform: ${platform}. Using Linux binary name.`,
        );
        return 'secure-wipe-bin';
    }
  }

  /**
   * Validate file path to prevent unauthorized access
   */
  private validatePath(filePath: string): boolean {
    const validation = SecureWipeUtils.validateFilePath(filePath);
    if (!validation.valid) {
      console.warn('Path validation failed:', validation.error);
      return false;
    }

    // Additional safety check
    const safetyCheck = SecureWipeUtils.isSafeToWipe(filePath);
    if (!safetyCheck.safe) {
      console.warn('Safety check failed:', safetyCheck.warning);

      // For block devices, allow the operation to proceed but with warnings
      // The binary itself will handle the final safety checks and privilege requirements
      if (SecureWipeUtils.isBlockDevice(filePath)) {
        console.warn(
          'Proceeding with block device wipe despite safety warning',
        );
        return true;
      }

      return false;
    }

    return true;
  }

  /**
   * Validate wipe algorithm
   */
  private validateAlgorithm(algorithm: WipeAlgorithm): boolean {
    return SecureWipeUtils.validateAlgorithm(algorithm);
  }

  /**
   * Validate pattern format
   */
  private validatePattern(pattern: string): boolean {
    // Allow "random" as a special pattern
    if (pattern.toLowerCase() === 'random') {
      return true;
    }

    // Validate hex pattern (0x00, 0xFF, etc.)
    const hexPattern = /^0x[0-9A-Fa-f]{2}$/;
    if (hexPattern.test(pattern)) {
      return true;
    }

    // Allow simple hex without 0x prefix
    const simpleHexPattern = /^[0-9A-Fa-f]{2}$/;
    if (simpleHexPattern.test(pattern)) {
      return true;
    }

    return false;
  }

  /**
   * Build command arguments for the secure-wipe binary
   */
  private buildArgs(
    config: SecureWipeConfig,
    listDrives = false,
    systemInfo = false,
  ): string[] {
    const args: string[] = ['--json'];

    // Handle simple utility commands
    if (listDrives) {
      args.push('--list-drives');
      return args;
    }

    if (systemInfo) {
      args.push('-s');
      return args;
    }

    // Validate and add core arguments based on mode
    this.addCoreArguments(args, config);

    // Add common optional arguments
    this.addOptionalArguments(args, config);

    return args;
  }

  /**
   * Add core arguments (target/demo and algorithm)
   */
  private addCoreArguments(args: string[], config: SecureWipeConfig): void {
    args.push('--force');
    // Validate algorithm for all modes
    if (!this.validateAlgorithm(config.algorithm)) {
      throw new Error(`Invalid algorithm: ${config.algorithm}`);
    }
    args.push('--algorithm', config.algorithm);

    if (config.demo) {
      args.push('--demo');

      if (config.demoSize) {
        const validation = SecureWipeUtils.validateDemoSize(config.demoSize);
        if (!validation.valid) {
          throw new Error(`Invalid demo size: ${validation.error}`);
        }
        args.push('--demo-size', config.demoSize.toString());
      }
    } else {
      // Non-demo mode requires target validation
      if (!this.validatePath(config.target)) {
        throw new Error(`Invalid target path: ${config.target}`);
      }
      args.push('--target', config.target);
    }
  }

  /**
   * Add optional arguments that apply to both demo and regular modes
   */
  private addOptionalArguments(args: string[], config: SecureWipeConfig): void {
    if (config.bufferSize) {
      const validation = SecureWipeUtils.validateBufferSize(config.bufferSize);
      if (!validation.valid) {
        throw new Error(`Invalid buffer size: ${validation.error}`);
      }
      args.push('--buffer-size', config.bufferSize.toString());
    }

    if (config.passes) {
      if (config.passes < 1 || config.passes > 100) {
        throw new Error('Number of passes must be between 1 and 100');
      }
      args.push('--passes', config.passes.toString());
    }
  }

  /**
   * Parse JSON events from accumulated buffer
   * Handles both single-line and multi-line JSON output
   */
  private parseEvents(data: string): (SecureWipeEvent | SystemInfo)[] {
    const events: (SecureWipeEvent | SystemInfo)[] = [];
    this.jsonBuffer += data;

    // Try to extract complete JSON objects from the buffer
    let startIndex = 0;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < this.jsonBuffer.length; i++) {
      const char = this.jsonBuffer[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          if (braceCount === 0) {
            startIndex = i;
          }
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            // Found complete JSON object
            const jsonStr = this.jsonBuffer.substring(startIndex, i + 1);
            const event = this.parseEvent(jsonStr);
            if (event) {
              events.push(event);
            }
            // Update buffer to remove parsed content
            this.jsonBuffer = this.jsonBuffer.substring(i + 1);
            i = -1; // Reset loop
            startIndex = 0;
          }
        }
      }
    }

    return events;
  }

  /**
   * Parse a single JSON event
   */
  private parseEvent(jsonStr: string): SecureWipeEvent | SystemInfo | null {
    try {
      const trimmed = jsonStr.trim();
      if (!trimmed) return null;

      console.log('Parsing JSON string:', trimmed);
      const parsed = JSON.parse(trimmed);
      console.log('Parsed JSON object:', parsed);

      // Check if it's a SystemInfo response (has os_name, os_version, architecture)
      if (parsed.os_name && parsed.os_version && parsed.architecture) {
        console.log('Identified as SystemInfo');
        return parsed as SystemInfo;
      }

      // Otherwise, it's a regular event
      console.log('Identified as SecureWipeEvent');
      return parsed as SecureWipeEvent;
    } catch (error) {
      console.warn(
        'Failed to parse JSON event:',
        `${jsonStr.substring(0, 100)}...`,
        error,
      );
      return null;
    }
  }

  /**
   * Check if admin privileges are needed for the operation
   */
  async checkPrivileges(targetPath?: string): Promise<PrivilegeCheckResult> {
    return AdminPrivilegesUtils.checkPrivileges(targetPath);
  }

  /**
   * Validate binary access and privilege requirements
   */
  async validateBinaryAccess(): Promise<BinaryAccessValidation> {
    return AdminPrivilegesUtils.validateBinaryAccess(this.binaryPath);
  }

  /**
   * Check if the system supports GUI-based privilege prompts
   */
  supportsGuiPrompts(): boolean {
    return AdminPrivilegesUtils.supportsGuiPrompts();
  }

  /**
   * Get a user-friendly description of the privilege escalation method
   */
  async getElevationDescription(targetPath?: string): Promise<string> {
    const privilegeCheck = await this.checkPrivileges(targetPath);
    return AdminPrivilegesUtils.getElevationDescription(privilegeCheck.method);
  }

  /**
   * Enhanced wipe target method that handles privilege escalation
   */
  async wipeTargetWithPrivileges(
    config: SecureWipeConfigWithPrivileges,
    onProgress?: ProgressCallback,
  ): Promise<SecureWipeResultWithPrivileges> {
    try {
      // Check if privileges are needed
      const privilegeCheck = await this.checkPrivileges(config.target);

      let privilegesRequested = false;
      let privilegeMethod: string | undefined;
      let privilegeError: string | undefined;

      // If privileges are needed and requested, handle escalation
      if (privilegeCheck.needsElevation && config.requestPrivileges !== false) {
        privilegesRequested = true;
        privilegeMethod = privilegeCheck.method;

        // If we're not already running with privileges, we need to escalate
        if (!privilegeCheck.hasPrivileges) {
          // For Linux/macOS, we can spawn the process with elevated privileges
          if (process.platform !== 'win32') {
            return this.wipeWithElevatedProcess(
              config,
              onProgress,
              privilegeCheck,
            );
          }
          // For Windows, we need to use a different approach
          return this.wipeWithWindowsElevation(
            config,
            onProgress,
            privilegeCheck,
          );
        }
      }

      // No privileges needed or already running with privileges
      const result = await this.wipeTarget(config, onProgress);
      return {
        ...result,
        privilegesRequested,
        privilegeMethod,
        privilegeError,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        privilegesRequested: false,
      };
    }
  }

  /**
   * Handle wipe operation with elevated process (Linux/macOS)
   */
  private async wipeWithElevatedProcess(
    config: SecureWipeConfigWithPrivileges,
    onProgress?: ProgressCallback,
    privilegeCheck?: PrivilegeCheckResult,
  ): Promise<SecureWipeResultWithPrivileges> {
    return new Promise(async (resolve) => {
      try {
        const args = this.buildArgs(config);
        console.log(
          `Starting elevated secure wipe: sudo/pkexec ${this.binaryPath} ${args.join(' ')}`,
        );

        const spawnResult = await AdminPrivilegesUtils.spawnWithPrivileges(
          this.binaryPath,
          args,
          config.privilegeOptions,
        );

        if (!spawnResult.success || !spawnResult.process) {
          resolve({
            success: false,
            error: spawnResult.error || 'Failed to spawn elevated process',
            privilegesRequested: true,
            privilegeMethod: spawnResult.method,
            privilegeError: spawnResult.error,
          });
          return;
        }

        this.activeProcess = spawnResult.process;

        let hasError = false;
        let errorMessage = '';
        const events: SecureWipeEvent[] = [];

        // Handle stdout (JSON events)
        this.activeProcess.stdout?.on('data', (data: Buffer) => {
          const parsedEvents = this.parseEvents(data.toString());

          for (const event of parsedEvents) {
            // Only handle SecureWipeEvent types, not SystemInfo
            if ('type' in event) {
              const wipeEvent = event as SecureWipeEvent;
              events.push(wipeEvent);

              // Emit to service event emitter
              this.emit('event', wipeEvent);

              // Call progress callback if provided
              if (onProgress) {
                onProgress(wipeEvent);
              }

              // Check for errors
              if (wipeEvent.type === 'error') {
                hasError = true;
                errorMessage = wipeEvent.message;
              }
            }
          }
        });

        // Handle stderr (non-JSON errors)
        this.activeProcess.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            console.warn('Elevated secure wipe stderr:', message);
            errorMessage += (errorMessage ? '\n' : '') + message;
          }
        });

        // Handle process completion
        this.activeProcess.on('close', (code: number | null) => {
          this.cleanup();

          if (code === 0 && !hasError) {
            resolve({
              success: true,
              exitCode: code,
              privilegesRequested: true,
              privilegeMethod: spawnResult.method,
            });
          } else {
            resolve({
              success: false,
              error: errorMessage || `Process exited with code ${code}`,
              exitCode: code || undefined,
              privilegesRequested: true,
              privilegeMethod: spawnResult.method,
            });
          }
        });

        // Handle process errors
        this.activeProcess.on('error', (error: Error) => {
          this.cleanup();
          resolve({
            success: false,
            error: `Elevated process error: ${error.message}`,
            privilegesRequested: true,
            privilegeMethod: spawnResult.method,
            privilegeError: error.message,
          });
        });

        // Set up timeout
        this.timeoutHandle = setTimeout(() => {
          if (this.activeProcess) {
            this.activeProcess.kill('SIGTERM');
            resolve({
              success: false,
              error: `Elevated operation timed out after ${this.timeout}ms`,
              privilegesRequested: true,
              privilegeMethod: spawnResult.method,
            });
          }
        }, this.timeout);
      } catch (error) {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          privilegesRequested: true,
          privilegeMethod: privilegeCheck?.method,
          privilegeError:
            error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Handle wipe operation with Windows elevation
   */
  private async wipeWithWindowsElevation(
    config: SecureWipeConfigWithPrivileges,
    onProgress?: ProgressCallback,
    privilegeCheck?: PrivilegeCheckResult,
  ): Promise<SecureWipeResultWithPrivileges> {
    try {
      const args = this.buildArgs(config);
      const command = this.binaryPath;

      console.log(
        `Starting Windows elevated secure wipe: ${command} ${args.join(' ')}`,
      );

      const executionResult = await AdminPrivilegesUtils.executeWithPrivileges(
        command,
        args,
        config.privilegeOptions,
      );

      if (!executionResult.success) {
        return {
          success: false,
          error: executionResult.error || 'Failed to execute with privileges',
          privilegesRequested: true,
          privilegeMethod: executionResult.method,
          privilegeError: executionResult.error,
        };
      }

      // Parse the output for events
      if (executionResult.stdout && onProgress) {
        const parsedEvents = this.parseEvents(executionResult.stdout);
        for (const event of parsedEvents) {
          if ('type' in event) {
            const wipeEvent = event as SecureWipeEvent;
            this.emit('event', wipeEvent);
            onProgress(wipeEvent);
          }
        }
      }

      return {
        success: true,
        privilegesRequested: true,
        privilegeMethod: executionResult.method,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        privilegesRequested: true,
        privilegeMethod: privilegeCheck?.method,
        privilegeError:
          error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Start a secure wipe operation
   */
  async wipeTarget(
    config: SecureWipeConfig,
    onProgress?: ProgressCallback,
  ): Promise<SecureWipeResult> {
    return new Promise((resolve, reject) => {
      try {
        const args = this.buildArgs(config);
        console.log(
          `Starting secure wipe: ${this.binaryPath} ${args.join(' ')}`,
        );

        this.activeProcess = spawn(this.binaryPath, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let hasError = false;
        let errorMessage = '';
        const events: SecureWipeEvent[] = [];

        // Handle stdout (JSON events)
        this.activeProcess.stdout?.on('data', (data: Buffer) => {
          const parsedEvents = this.parseEvents(data.toString());

          for (const event of parsedEvents) {
            // Only handle SecureWipeEvent types, not SystemInfo
            if ('type' in event) {
              const wipeEvent = event as SecureWipeEvent;
              events.push(wipeEvent);

              // Emit to service event emitter
              this.emit('event', wipeEvent);

              // Call progress callback if provided
              if (onProgress) {
                onProgress(wipeEvent);
              }

              // Check for errors
              if (wipeEvent.type === 'error') {
                hasError = true;
                errorMessage = wipeEvent.message;
              }
            }
          }
        });

        // Handle stderr (non-JSON errors)
        this.activeProcess.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            console.warn('Secure wipe stderr:', message);
            errorMessage += (errorMessage ? '\n' : '') + message;
          }
        });

        // Handle process completion
        this.activeProcess.on('close', (code: number | null) => {
          this.cleanup();

          if (code === 0 && !hasError) {
            resolve({
              success: true,
              exitCode: code,
            });
          } else {
            resolve({
              success: false,
              error: errorMessage || `Process exited with code ${code}`,
              exitCode: code || undefined,
            });
          }
        });

        // Handle process errors
        this.activeProcess.on('error', (error: Error) => {
          this.cleanup();
          reject(
            new Error(`Failed to start secure-wipe process: ${error.message}`),
          );
        });

        // Set up timeout
        this.timeoutHandle = setTimeout(() => {
          if (this.activeProcess) {
            this.activeProcess.kill('SIGTERM');
            reject(new Error(`Operation timed out after ${this.timeout}ms`));
          }
        }, this.timeout);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * List available drives
   */
  async listDrives(): Promise<DriveInfo[]> {
    return new Promise((resolve, reject) => {
      try {
        const args = this.buildArgs({ target: '', algorithm: 'random' }, true);
        console.log(`Listing drives: ${this.binaryPath} ${args.join(' ')}`);

        this.activeProcess = spawn(this.binaryPath, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let drives: DriveInfo[] = [];
        let errorMessage = '';

        // Handle stdout
        this.activeProcess.stdout?.on('data', (data: Buffer) => {
          const parsedEvents = this.parseEvents(data.toString());

          for (const event of parsedEvents) {
            if ('type' in event && event.type === 'drive_list') {
              drives = (event as any).drives;
            } else if ('type' in event && event.type === 'error') {
              errorMessage = (event as any).message;
            }
          }
        });

        // Handle stderr
        this.activeProcess.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            errorMessage += (errorMessage ? '\n' : '') + message;
          }
        });

        // Handle completion
        this.activeProcess.on('close', (code: number | null) => {
          this.cleanup();

          if (code === 0) {
            resolve(drives);
          } else {
            reject(
              new Error(errorMessage || `Process exited with code ${code}`),
            );
          }
        });

        // Handle errors
        this.activeProcess.on('error', (error: Error) => {
          this.cleanup();
          reject(new Error(`Failed to start process: ${error.message}`));
        });

        // Set up timeout
        this.timeoutHandle = setTimeout(() => {
          if (this.activeProcess) {
            this.activeProcess.kill('SIGTERM');
            reject(
              new Error(`Drive listing timed out after ${this.timeout}ms`),
            );
          }
        }, this.timeout);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<SystemInfo> {
    return new Promise((resolve, reject) => {
      try {
        const args = this.buildArgs(
          { target: '', algorithm: 'random' },
          false,
          true,
        );
        console.log(
          `Getting system info: ${this.binaryPath} ${args.join(' ')}`,
        );

        this.activeProcess = spawn(this.binaryPath, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let systemInfo: SystemInfo | null = null;
        let errorMessage = '';

        // Handle stdout
        this.activeProcess.stdout?.on('data', (data: Buffer) => {
          const rawData = data.toString();
          console.log('Raw system info data:', rawData);

          const parsedEvents = this.parseEvents(rawData);
          console.log('Parsed events:', parsedEvents);

          for (const event of parsedEvents) {
            // Check if the event is SystemInfo (it should be the direct JSON response)
            if (
              typeof event === 'object' &&
              event !== null &&
              'os_name' in event &&
              'os_version' in event &&
              'architecture' in event
            ) {
              console.log('Found system info:', event);
              systemInfo = event as SystemInfo;
            } else if ('type' in event && event.type === 'error') {
              errorMessage = (event as any).message;
            }
          }
        });

        // Handle stderr
        this.activeProcess.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            errorMessage += (errorMessage ? '\n' : '') + message;
          }
        });

        // Handle completion
        this.activeProcess.on('close', (code: number | null) => {
          this.cleanup();

          if (code === 0 && systemInfo) {
            resolve(systemInfo);
          } else {
            reject(
              new Error(
                errorMessage || systemInfo === null
                  ? 'No system info received'
                  : `Process exited with code ${code}`,
              ),
            );
          }
        });

        // Handle errors
        this.activeProcess.on('error', (error: Error) => {
          this.cleanup();
          reject(new Error(`Failed to start process: ${error.message}`));
        });

        // Set up timeout
        this.timeoutHandle = setTimeout(() => {
          if (this.activeProcess) {
            this.activeProcess.kill('SIGTERM');
            reject(
              new Error(
                `System info request timed out after ${this.timeout}ms`,
              ),
            );
          }
        }, this.timeout);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Cancel active operation
   */
  cancel(): void {
    if (this.activeProcess) {
      console.log('Cancelling secure wipe operation');

      // Emit a cancellation event for the UI
      const cancelEvent = {
        type: 'info' as const,
        message: 'Operation cancelled by user',
        timestamp: Date.now(),
      };
      this.emit('event', cancelEvent);

      // Kill the process
      this.activeProcess.kill('SIGTERM');

      // Set a timeout to force kill if SIGTERM doesn't work
      setTimeout(() => {
        if (this.activeProcess) {
          console.log('Force killing secure wipe process with SIGKILL');
          this.activeProcess.kill('SIGKILL');
          this.cleanup(); // Make sure to cleanup after force kill
        }
      }, 2000); // 2 second timeout

      this.cleanup();
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.activeProcess = null;
    this.jsonBuffer = ''; // Clear JSON buffer
  }

  /**
   * Check if the binary exists and is executable
   * Returns detailed information about binary status
   */
  async checkBinary(): Promise<{
    exists: boolean;
    path: string;
    platform: string;
    isExecutable?: boolean;
    error?: string;
  }> {
    const { platform } = process;
    try {
      const stats = await fs.promises.stat(this.binaryPath);
      const exists = stats.isFile();

      // Check if file is executable (Unix-like systems)
      let isExecutable = true;
      if (platform !== 'win32' && exists) {
        try {
          await fs.promises.access(this.binaryPath, fs.constants.X_OK);
        } catch {
          isExecutable = false;
        }
      }

      return {
        exists,
        path: this.binaryPath,
        platform,
        isExecutable,
      };
    } catch (error) {
      return {
        exists: false,
        path: this.binaryPath,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get the current binary path
   */
  getBinaryPath(): string {
    return this.binaryPath;
  }

  /**
   * Set a new binary path
   */
  setBinaryPath(binaryPath: string): void {
    this.binaryPath = binaryPath;
  }

  /**
   * Check if an operation is currently active
   */
  isActive(): boolean {
    return this.activeProcess !== null;
  }

  /**
   * Get detailed information about the binary and platform
   */
  async getBinaryInfo(): Promise<{
    binaryPath: string;
    platform: string;
    supportedPlatforms: string[];
    binaryStatus: Awaited<ReturnType<SecureWipeService['checkBinary']>>;
  }> {
    const { platform } = process;
    const supportedPlatforms = ['win32', 'linux']; // Add 'darwin' when macOS binary is available
    const binaryStatus = await this.checkBinary();

    return {
      binaryPath: this.binaryPath,
      platform,
      supportedPlatforms,
      binaryStatus,
    };
  }

  /**
   * Attempt to find and set the binary for the current platform
   */
  async findAndSetBinary(): Promise<boolean> {
    const newPath = this.getDefaultBinaryPath();
    this.setBinaryPath(newPath);

    const status = await this.checkBinary();
    return status.exists && status.isExecutable !== false;
  }
}

// Export a singleton instance
export const secureWipeService = new SecureWipeService();
