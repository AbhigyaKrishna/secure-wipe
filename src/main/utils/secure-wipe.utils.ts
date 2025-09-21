/**
 * Utility functions for the secure-wipe service
 * Includes helper functions for validation, formatting, and security
 */

import path from 'path';
import fs from 'fs';
import { WipeAlgorithm, DriveInfo } from '../types/secure-wipe';

/**
 * Security utilities as recommended in the API documentation
 */
export class SecureWipeUtils {
  /**
   * Validate and sanitize file path
   * Prevents directory traversal and unauthorized access
   */
  static validateFilePath(filePath: string): {
    valid: boolean;
    error?: string;
  } {
    try {
      // Resolve the path to prevent directory traversal
      const resolvedPath = path.resolve(filePath);

      // Check for dangerous patterns
      if (filePath.includes('..') || filePath.includes('~')) {
        return {
          valid: false,
          error: 'Path contains potentially dangerous patterns',
        };
      }

      // Check for null bytes (path injection)
      if (filePath.includes('\0')) {
        return { valid: false, error: 'Path contains null bytes' };
      }

      // Ensure path is absolute after resolution
      if (!path.isAbsolute(resolvedPath)) {
        return { valid: false, error: 'Path must be absolute' };
      }

      // For regular files, check if they exist
      if (!this.isBlockDevice(filePath)) {
        if (!fs.existsSync(resolvedPath)) {
          return { valid: false, error: 'File does not exist' };
        }

        // Check if it's actually a file
        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
          return { valid: false, error: 'Path is not a regular file' };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check if a path is a block device
   */
  static isBlockDevice(filePath: string): boolean {
    // Unix block devices
    if (filePath.startsWith('/dev/')) {
      return true;
    }

    // Windows physical drives and volumes
    if (
      filePath.startsWith('\\\\.\\PhysicalDrive') ||
      filePath.match(/^\\\\\.\\[A-Z]:$/)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Validate wipe algorithm
   */
  static validateAlgorithm(algorithm: string): algorithm is WipeAlgorithm {
    const validAlgorithms: WipeAlgorithm[] = [
      'dod5220',
      'gutmann',
      'random',
      'zeros',
      'ones',
    ];
    return validAlgorithms.includes(algorithm as WipeAlgorithm);
  }

  /**
   * Get algorithm description and pass count
   */
  static getAlgorithmInfo(algorithm: WipeAlgorithm): {
    name: string;
    passes: number;
    description: string;
  } {
    const algorithmInfo = {
      dod5220: {
        name: 'DoD 5220.22-M',
        passes: 3,
        description:
          'US Department of Defense standard - 3 passes with specific patterns',
      },
      gutmann: {
        name: 'Gutmann Method',
        passes: 35,
        description: "Peter Gutmann's 35-pass method - most secure but slowest",
      },
      random: {
        name: 'Random Data',
        passes: 1,
        description: 'Single pass with cryptographically secure random data',
      },
      zeros: {
        name: 'Zero Fill',
        passes: 1,
        description: 'Single pass overwriting with zeros',
      },
      ones: {
        name: 'One Fill',
        passes: 1,
        description: 'Single pass overwriting with ones (0xFF)',
      },
    };

    return (
      algorithmInfo[algorithm] || {
        name: 'Unknown',
        passes: 0,
        description: 'Unknown algorithm',
      }
    );
  }

  /**
   * Format file size in human-readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Format duration in human-readable format
   */
  static formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Format throughput in human-readable format
   */
  static formatThroughput(bytesPerSecond: number): string {
    return `${this.formatFileSize(bytesPerSecond)}/s`;
  }

  /**
   * Validate buffer size (in KB)
   */
  static validateBufferSize(bufferSize: number): {
    valid: boolean;
    error?: string;
  } {
    if (bufferSize < 1) {
      return { valid: false, error: 'Buffer size must be at least 1 KB' };
    }

    if (bufferSize > 1024 * 1024) {
      // 1 GB
      return { valid: false, error: 'Buffer size cannot exceed 1 GB' };
    }

    // Recommend power of 2 sizes
    if (bufferSize > 1024 && (bufferSize & (bufferSize - 1)) !== 0) {
      console.warn(
        'Buffer size should be a power of 2 for optimal performance',
      );
    }

    return { valid: true };
  }

  /**
   * Estimate operation time based on file size and algorithm
   */
  static estimateOperationTime(
    fileSizeBytes: number,
    algorithm: WipeAlgorithm,
    throughputMBps = 50,
  ): string {
    const algorithmInfo = this.getAlgorithmInfo(algorithm);
    const totalBytes = fileSizeBytes * algorithmInfo.passes;
    const estimatedSeconds = totalBytes / (throughputMBps * 1024 * 1024);

    return this.formatDuration(estimatedSeconds);
  }

  /**
   * Check if running with elevated privileges (required for partition wiping)
   */
  static hasElevatedPrivileges(): boolean {
    if (process.platform === 'win32') {
      // On Windows, check if running as administrator
      // This is a simplified check - in production, you might want to use a native module
      return process.getuid ? process.getuid() === 0 : false;
    } else {
      // On Unix-like systems, check if running as root
      return process.getuid?.() === 0;
    }
  }

  /**
   * Filter drives by type
   */
  static filterDrivesByType(
    drives: DriveInfo[],
    type: 'disk' | 'part' | 'all' = 'all',
  ): DriveInfo[] {
    if (type === 'all') {
      return drives;
    }
    return drives.filter((drive) => drive.drive_type === type);
  }

  /**
   * Sort drives by path for consistent display
   */
  static sortDrives(drives: DriveInfo[]): DriveInfo[] {
    return drives.sort((a, b) => {
      // Sort disks before partitions
      if (a.drive_type !== b.drive_type) {
        return a.drive_type === 'disk' ? -1 : 1;
      }
      // Then sort by path
      return a.path.localeCompare(b.path);
    });
  }

  /**
   * Check if a path is safe to wipe (additional safety check)
   */
  static isSafeToWipe(filePath: string): { safe: boolean; warning?: string } {
    const resolvedPath = path.resolve(filePath);

    // Dangerous system paths
    const dangerousPaths = [
      '/',
      '/boot',
      '/etc',
      '/usr',
      '/bin',
      '/sbin',
      '/lib',
      'C:\\',
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\Users',
    ];

    // Check if path is in dangerous locations
    for (const dangerousPath of dangerousPaths) {
      if (
        resolvedPath === dangerousPath ||
        resolvedPath.startsWith(dangerousPath + path.sep)
      ) {
        return {
          safe: false,
          warning: `Attempting to wipe system directory: ${dangerousPath}. This could damage your system.`,
        };
      }
    }

    // Block device additional checks
    if (this.isBlockDevice(filePath)) {
      if (!this.hasElevatedPrivileges()) {
        return {
          safe: false,
          warning:
            'Wiping block devices requires administrator/root privileges.',
        };
      }

      // Warn about wiping entire disks
      if (
        filePath.includes('PhysicalDrive') ||
        (filePath.startsWith('/dev/') && !filePath.match(/\d+$/))
      ) {
        return {
          safe: false,
          warning:
            'You are attempting to wipe an entire disk. This will destroy all data and partitions on the device.',
        };
      }
    }

    return { safe: true };
  }

  /**
   * Generate an audit log entry
   */
  static generateAuditLogEntry(
    operation: string,
    target: string,
    algorithm?: WipeAlgorithm,
    result?: string,
  ): string {
    const timestamp = new Date().toISOString();
    const user = process.env.USER || process.env.USERNAME || 'unknown';
    const pid = process.pid;

    return `[${timestamp}] PID:${pid} USER:${user} OPERATION:${operation} TARGET:${target}${algorithm ? ` ALGORITHM:${algorithm}` : ''}${result ? ` RESULT:${result}` : ''}`;
  }

  /**
   * Validate demo size (in MB)
   */
  static validateDemoSize(sizeInMB: number): {
    valid: boolean;
    error?: string;
  } {
    if (sizeInMB < 1) {
      return { valid: false, error: 'Demo size must be at least 1 MB' };
    }

    if (sizeInMB > 10240) {
      // 10 GB
      return { valid: false, error: 'Demo size cannot exceed 10 GB' };
    }

    return { valid: true };
  }
}
