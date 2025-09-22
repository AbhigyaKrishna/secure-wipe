/**
 * TypeScript definitions for the secure-wipe binary JSON API
 * Based on the BINARY_API.md documentation
 */

// Available wiping algorithms
export type WipeAlgorithm = 'dod5220' | 'gutmann' | 'random' | 'zeros' | 'ones';

// Base interface for all JSON events
export interface BaseEvent {
  type: string;
}

// Start event - emitted when wiping process begins
export interface StartEvent extends BaseEvent {
  type: 'start';
  algorithm: string;
  total_passes: number;
  file_size_bytes: number;
  buffer_size_kb: number;
}

// Pass start event - emitted when a new wiping pass begins
export interface PassStartEvent extends BaseEvent {
  type: 'pass_start';
  pass: number;
  total_passes: number;
  pattern: string;
}

// Progress event - emitted periodically during wiping
export interface ProgressEvent extends BaseEvent {
  type: 'progress';
  pass: number;
  total_passes: number;
  bytes_written: number;
  total_bytes: number;
  percent: number;
  bytes_per_second: number;
}

// Pass complete event - emitted when a wiping pass is finished
export interface PassCompleteEvent extends BaseEvent {
  type: 'pass_complete';
  pass: number;
  total_passes: number;
}

// Complete event - emitted when entire wiping process is finished
export interface CompleteEvent extends BaseEvent {
  type: 'complete';
  total_time_seconds: number;
  average_throughput_mb_s: number;
}

// Demo file creating event - for demo mode
export interface DemoFileCreatingEvent extends BaseEvent {
  type: 'demo_file_creating';
  bytes_written: number;
  total_bytes: number;
  percent: number;
}

// Demo file created event - for demo mode
export interface DemoFileCreatedEvent extends BaseEvent {
  type: 'demo_file_created';
  path: string;
  size_mb: number;
}

// Info event - general informational messages
export interface InfoEvent extends BaseEvent {
  type: 'info';
  message: string;
}

// Error event - error messages and failures
export interface ErrorEvent extends BaseEvent {
  type: 'error';
  message: string;
}

// Drive information for drive listing
export interface DriveInfo {
  path: string;
  drive_type: 'disk' | 'part';
  size_bytes: number | null;
  size_gb: number;
  description: string;
}

// Drive list event - response to --list-drives
export interface DriveListEvent extends BaseEvent {
  type: 'drive_list';
  drives: DriveInfo[];
}

// CPU information structure
export interface CpuInfo {
  logical_cores: number;
  physical_cores: number;
  model_name: string;
  frequency_mhz: number;
}

// Storage device information structure
export interface StorageDevice {
  name: string;
  device_path: string;
  size_bytes: number;
  device_type: string;
  mount_point: string;
  file_system: string;
}

// System information structure
export interface SystemInfo {
  os_name: string;
  os_version: string;
  architecture: string;
  hostname: string;
  username: string;
  total_memory_bytes: number;
  available_memory_bytes: number;
  cpu_info: CpuInfo;
  storage_devices: StorageDevice[];
  supportsGuiPrompts?: boolean;
}

// Union type for all possible events
export type SecureWipeEvent =
  | StartEvent
  | PassStartEvent
  | ProgressEvent
  | PassCompleteEvent
  | CompleteEvent
  | DemoFileCreatingEvent
  | DemoFileCreatedEvent
  | InfoEvent
  | ErrorEvent
  | DriveListEvent;

// Configuration for secure wipe operation
export interface SecureWipeConfig {
  target: string;
  algorithm: WipeAlgorithm;
  bufferSize?: number; // in KB
  demo?: boolean;
  demoSize?: number; // in MB
  passes?: number; // Custom number of passes (overrides algorithm default)
}

// Result of a secure wipe operation
export interface SecureWipeResult {
  success: boolean;
  error?: string;
  exitCode?: number;
}

// Progress callback function type
export type ProgressCallback = (event: SecureWipeEvent) => void;

// Options for the secure wipe service
export interface SecureWipeServiceOptions {
  binaryPath?: string; // Path to the secure-wipe binary
  timeout?: number; // Operation timeout in milliseconds
}

// Privilege check result interface
export interface PrivilegeCheckResult {
  hasPrivileges: boolean;
  needsElevation: boolean;
  currentUser: string;
  isRoot: boolean;
  platform: string;
  method?: 'sudo' | 'pkexec' | 'runas' | 'none';
}

// Privilege escalation options
export interface PrivilegeEscalationOptions {
  name: string; // Application name for the privilege prompt
  icns?: string; // Path to icon file (macOS)
  windowsHide?: boolean; // Hide command window on Windows
}

// Privilege escalation result
export interface PrivilegeEscalationResult {
  success: boolean;
  error?: string;
  method?: string;
  stdout?: string;
  stderr?: string;
}

// Binary access validation result
export interface BinaryAccessValidation {
  canExecute: boolean;
  needsElevation: boolean;
  error?: string;
}

// Enhanced secure wipe config with privilege options
export interface SecureWipeConfigWithPrivileges extends SecureWipeConfig {
  requestPrivileges?: boolean; // Whether to request admin privileges
  privilegeOptions?: Partial<PrivilegeEscalationOptions>; // Options for privilege escalation
}

// Enhanced secure wipe result with privilege information
export interface SecureWipeResultWithPrivileges extends SecureWipeResult {
  privilegesRequested?: boolean; // Whether privileges were requested
  privilegeMethod?: string; // Method used for privilege escalation
  privilegeError?: string; // Error during privilege escalation
}
