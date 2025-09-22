/**
 * Admin Privileges Utility
 * Handles privilege escalation for secure wipe operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as sudoPrompt from 'sudo-prompt';

export interface PrivilegeCheckResult {
  hasPrivileges: boolean;
  needsElevation: boolean;
  currentUser: string;
  isRoot: boolean;
  platform: string;
  method?: 'sudo' | 'pkexec' | 'runas' | 'none';
}

export interface PrivilegeEscalationOptions {
  name: string; // Application name for the privilege prompt
  icns?: string; // Path to icon file (macOS)
  windowsHide?: boolean; // Hide command window on Windows
}

export interface PrivilegeEscalationResult {
  success: boolean;
  error?: string;
  method?: string;
  stdout?: string;
  stderr?: string;
}

export class AdminPrivilegesUtils {
  private static readonly defaultOptions: PrivilegeEscalationOptions = {
    name: 'Secure Wipe',
    windowsHide: true,
  };

  /**
   * Check current privilege level and determine if elevation is needed
   */
  static async checkPrivileges(
    targetPath?: string,
  ): Promise<PrivilegeCheckResult> {
    const { platform } = process;
    const currentUser = this.getCurrentUser();
    const isRoot = this.isRunningAsRoot();

    // Base result
    const result: PrivilegeCheckResult = {
      hasPrivileges: isRoot,
      needsElevation: false,
      currentUser,
      isRoot,
      platform,
    };

    // If already running as root/admin, no escalation needed
    if (isRoot) {
      return result;
    }

    // If we have a specific target path, check if we need privileges for it
    if (targetPath) {
      const needsPrivileges = await this.targetRequiresPrivileges(targetPath);
      result.needsElevation = needsPrivileges;

      if (needsPrivileges) {
        result.method = this.getElevationMethod(platform);
      }
    } else {
      // General case - secure wiping typically requires admin privileges
      result.needsElevation = true;
      result.method = this.getElevationMethod(platform);
    }

    return result;
  }

  /**
   * Get the current username
   */
  private static getCurrentUser(): string {
    try {
      if (process.platform === 'win32') {
        return process.env.USERNAME || 'unknown';
      }
      return process.env.USER || process.env.LOGNAME || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Check if running as root/administrator
   */
  private static isRunningAsRoot(): boolean {
    try {
      if (process.platform === 'win32') {
        // On Windows, check if we can write to a system directory
        try {
          const systemDir = process.env.SYSTEMROOT || 'C:\\Windows';
          const testFile = path.join(
            systemDir,
            'temp',
            `test-${Date.now()}.tmp`,
          );
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          return true;
        } catch {
          return false;
        }
      } else {
        // On Unix-like systems, check UID
        return !!(process.getuid && process.getuid() === 0);
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Determine if a target path requires elevated privileges
   */
  private static async targetRequiresPrivileges(
    targetPath: string,
  ): Promise<boolean> {
    try {
      // Try to access the target or its parent directory
      const stat = await fs.promises.stat(targetPath);

      if (stat.isDirectory()) {
        // For directories, try to create a test file
        const testFile = path.join(
          targetPath,
          `.secure-wipe-test-${Date.now()}`,
        );
        try {
          await fs.promises.writeFile(testFile, 'test');
          await fs.promises.unlink(testFile);
          return false; // No privileges needed
        } catch {
          return true; // Privileges needed
        }
      } else {
        // For files, check if we can write to the parent directory
        const parentDir = path.dirname(targetPath);
        return this.targetRequiresPrivileges(parentDir);
      }
    } catch (error) {
      // If we can't even stat the file, we likely need privileges
      return true;
    }
  }

  /**
   * Get the appropriate elevation method for the platform
   */
  private static getElevationMethod(
    platform: string,
  ): 'sudo' | 'pkexec' | 'runas' | 'none' {
    switch (platform) {
      case 'linux':
        // Check if pkexec is available (more user-friendly on Linux desktops)
        try {
          execSync('which pkexec', { stdio: 'ignore' });
          return 'pkexec';
        } catch {
          // Fall back to sudo
          try {
            execSync('which sudo', { stdio: 'ignore' });
            return 'sudo';
          } catch {
            return 'none';
          }
        }

      case 'darwin': // macOS
        return 'sudo'; // Use sudo-prompt which handles macOS authorization dialogs

      case 'win32':
        return 'runas';

      default:
        return 'none';
    }
  }

  /**
   * Execute a command with elevated privileges
   */
  static async executeWithPrivileges(
    command: string,
    args: string[],
    options: Partial<PrivilegeEscalationOptions> = {},
  ): Promise<PrivilegeEscalationResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const { platform } = process;
    const method = this.getElevationMethod(platform);

    if (method === 'none') {
      return {
        success: false,
        error: 'No privilege escalation method available on this platform',
      };
    }

    // Build the command string
    const fullCommand = `"${command}" ${args.map((arg) => `"${arg}"`).join(' ')}`;

    return new Promise((resolve) => {
      sudoPrompt.exec(fullCommand, mergedOptions, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            method,
            stderr: stderr?.toString(),
          });
        } else {
          resolve({
            success: true,
            method,
            stdout: stdout?.toString(),
            stderr: stderr?.toString(),
          });
        }
      });
    });
  }

  /**
   * Spawn a process with elevated privileges and return the process object
   * This is useful for long-running processes where we need to monitor progress
   */
  static async spawnWithPrivileges(
    command: string,
    args: string[],
    options: Partial<PrivilegeEscalationOptions> = {},
  ): Promise<{
    success: boolean;
    process?: ChildProcess;
    error?: string;
    method?: string;
  }> {
    const { platform } = process;
    const method = this.getElevationMethod(platform);

    if (method === 'none') {
      return {
        success: false,
        error: 'No privilege escalation method available on this platform',
      };
    }

    try {
      let elevatedProcess: ChildProcess;

      switch (method) {
        case 'sudo':
          elevatedProcess = spawn('sudo', [command, ...args], {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          break;

        case 'pkexec':
          elevatedProcess = spawn('pkexec', [command, ...args], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
              ...process.env,
              DISPLAY: process.env.DISPLAY || ':0',
            },
          });
          break;

        case 'runas':
          // On Windows, we'll use the sudo-prompt approach since runas is more complex
          return {
            success: false,
            error:
              'Windows process spawning with privileges requires executeWithPrivileges method',
            method,
          };

        default:
          return {
            success: false,
            error: `Unsupported elevation method: ${method}`,
            method,
          };
      }

      return {
        success: true,
        process: elevatedProcess,
        method,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        method,
      };
    }
  }

  /**
   * Check if the system supports GUI-based privilege prompts
   */
  static supportsGuiPrompts(): boolean {
    const { platform } = process;

    switch (platform) {
      case 'darwin':
        return true; // macOS always supports GUI prompts

      case 'linux':
        // Check if we have a desktop environment
        return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

      case 'win32':
        return true; // Windows supports UAC prompts

      default:
        return false;
    }
  }

  /**
   * Get a user-friendly description of the privilege escalation method
   */
  static getElevationDescription(method?: string): string {
    switch (method) {
      case 'sudo':
        return 'Administrator password required (sudo)';

      case 'pkexec':
        return 'Authentication required (PolicyKit)';

      case 'runas':
        return 'Administrator privileges required (UAC)';

      default:
        return 'Administrator privileges required';
    }
  }

  /**
   * Validate that the secure-wipe binary can be executed with current privileges
   */
  static async validateBinaryAccess(binaryPath: string): Promise<{
    canExecute: boolean;
    needsElevation: boolean;
    error?: string;
  }> {
    try {
      // Check if binary exists and is executable
      await fs.promises.access(binaryPath, fs.constants.X_OK);

      // For now, assume secure wiping always needs elevation
      // This could be made more sophisticated by checking the target
      const privilegeCheck = await this.checkPrivileges();

      return {
        canExecute: true,
        needsElevation: privilegeCheck.needsElevation,
      };
    } catch (error) {
      return {
        canExecute: false,
        needsElevation: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
