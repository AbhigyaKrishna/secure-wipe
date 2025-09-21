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
} from '../types/secure-wipe';
import { SecureWipeUtils } from '../utils/secure-wipe.utils';

export class SecureWipeService extends EventEmitter {
  private binaryPath: string;
  private timeout: number;
  private activeProcess: ChildProcess | null = null;
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(options: SecureWipeServiceOptions = {}) {
    super();

    // Default binary path - should be in resources or app directory
    this.binaryPath = options.binaryPath || this.getDefaultBinaryPath();
    this.timeout = options.timeout || 300000; // 5 minutes default timeout
  }

  /**
   * Get the default path to the secure-wipe binary
   */
  private getDefaultBinaryPath(): string {
    const platform = process.platform;
    const binaryName =
      platform === 'win32' ? 'secure-wipe-bin.exe' : 'secure-wipe-bin';

    // Try multiple possible locations
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'assets', binaryName),
      path.join(process.resourcesPath || '', 'assets', binaryName),
      path.join(__dirname, 'bin', binaryName),
      binaryName, // Assume it's in PATH
    ];

    for (const binPath of possiblePaths) {
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    }

    return binaryName; // Fallback to PATH lookup
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
   * Build command arguments for the secure-wipe binary
   */
  private buildArgs(config: SecureWipeConfig, listDrives = false): string[] {
    const args: string[] = ['--json'];

    if (listDrives) {
      args.push('--list-drives');
      return args;
    }

    // Validate inputs
    if (!this.validatePath(config.target)) {
      throw new Error(`Invalid target path: ${config.target}`);
    }

    if (!this.validateAlgorithm(config.algorithm)) {
      throw new Error(`Invalid algorithm: ${config.algorithm}`);
    }

    args.push('--target', config.target);
    args.push('--algorithm', config.algorithm);

    if (config.force) {
      args.push('--force');
    }

    if (config.bufferSize) {
      const bufferValidation = SecureWipeUtils.validateBufferSize(
        config.bufferSize,
      );
      if (!bufferValidation.valid) {
        throw new Error(`Invalid buffer size: ${bufferValidation.error}`);
      }
      args.push('--buffer-size', config.bufferSize.toString());
    }

    if (config.demo) {
      args.push('--demo');
      if (config.demoSize) {
        const demoSizeValidation = SecureWipeUtils.validateDemoSize(
          config.demoSize,
        );
        if (!demoSizeValidation.valid) {
          throw new Error(`Invalid demo size: ${demoSizeValidation.error}`);
        }
        args.push('--demo-size', config.demoSize.toString());
      }
    }

    return args;
  }

  /**
   * Parse JSON event from stdout line
   */
  private parseEvent(line: string): SecureWipeEvent | null {
    try {
      const trimmed = line.trim();
      if (!trimmed) return null;

      return JSON.parse(trimmed) as SecureWipeEvent;
    } catch (error) {
      console.warn('Failed to parse JSON event:', line, error);
      return null;
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
          const lines = data.toString().split('\n');

          for (const line of lines) {
            const event = this.parseEvent(line);
            if (event) {
              events.push(event);

              // Emit to service event emitter
              this.emit('event', event);

              // Call progress callback if provided
              if (onProgress) {
                onProgress(event);
              }

              // Check for errors
              if (event.type === 'error') {
                hasError = true;
                errorMessage = event.message;
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
          const lines = data.toString().split('\n');

          for (const line of lines) {
            const event = this.parseEvent(line);
            if (event && event.type === 'drive_list') {
              drives = event.drives;
            } else if (event && event.type === 'error') {
              errorMessage = event.message;
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
   * Cancel active operation
   */
  cancel(): void {
    if (this.activeProcess) {
      console.log('Cancelling secure wipe operation');
      this.activeProcess.kill('SIGTERM');
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
  }

  /**
   * Check if the binary exists and is executable
   */
  async checkBinary(): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(this.binaryPath);
      return stats.isFile();
    } catch {
      return false;
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
}

// Export a singleton instance
export const secureWipeService = new SecureWipeService();
