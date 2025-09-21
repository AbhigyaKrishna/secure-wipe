# Secure Wipe Service for Electron

This service provides a TypeScript interface for integrating the secure-wipe binary into Electron applications. It handles process spawning, JSON event parsing, progress reporting, and security validation.

## Overview

The service consists of several key components:

- **TypeScript Types** (`src/main/types/secure-wipe.ts`) - Complete type definitions for all JSON events
- **Main Service** (`src/main/services/secure-wipe.service.ts`) - Core service class handling binary integration
- **Utility Functions** (`src/main/utils/secure-wipe.utils.ts`) - Security validation and helper functions
- **IPC Integration** (`src/main/main.ts` & `src/main/preload.ts`) - Electron IPC channels for renderer communication
- **Demo Component** (`src/renderer/components/SecureWipeDemo.tsx`) - Example usage in renderer process

## Features

### Core Functionality
- ✅ Secure file and partition wiping
- ✅ Real-time progress reporting with JSON events
- ✅ Support for multiple algorithms (DoD 5220.22-M, Gutmann, Random, etc.)
- ✅ Drive listing and detection
- ✅ Demo mode for safe testing
- ✅ Operation cancellation
- ✅ Comprehensive error handling

### Security Features
- ✅ Path validation and sanitization
- ✅ Directory traversal prevention
- ✅ Block device detection
- ✅ Elevated privileges checking
- ✅ Safe operation validation
- ✅ Audit logging support

### Developer Experience
- ✅ Full TypeScript support
- ✅ Event-driven architecture
- ✅ Promise-based async operations
- ✅ Comprehensive error messages
- ✅ Built-in utilities for formatting and validation

## Quick Start

### 1. Service Usage in Main Process

```typescript
import { secureWipeService } from './services/secure-wipe.service';

// Wipe a file
const result = await secureWipeService.wipeTarget({
  target: '/path/to/file',
  algorithm: 'dod5220',
  force: true
}, (event) => {
  console.log('Progress:', event);
});

// List drives
const drives = await secureWipeService.listDrives();
console.log('Available drives:', drives);
```

### 2. Usage from Renderer Process

```typescript
// Start a wipe operation
const result = await window.electron.secureWipe.wipe({
  target: '/path/to/file',
  algorithm: 'random',
  force: true
});

// Listen for progress events
const cleanup = window.electron.secureWipe.onProgress((event) => {
  if (event.type === 'progress') {
    console.log(`Progress: ${event.percent}%`);
  }
});

// List available drives
const driveResult = await window.electron.secureWipe.listDrives();
if (driveResult.success) {
  console.log('Drives:', driveResult.drives);
}
```

## API Reference

### SecureWipeService Class

#### Methods

**`wipeTarget(config: SecureWipeConfig, onProgress?: ProgressCallback): Promise<SecureWipeResult>`**
- Starts a secure wipe operation
- Returns a promise that resolves when the operation completes
- Calls `onProgress` callback for each event

**`listDrives(): Promise<DriveInfo[]>`**
- Lists all available drives and partitions
- Returns drive information including path, type, and size

**`cancel(): void`**
- Cancels the active operation
- Sends SIGTERM to the binary process

**`checkBinary(): Promise<boolean>`**
- Checks if the secure-wipe binary exists and is accessible

**`isActive(): boolean`**
- Returns true if an operation is currently running

#### Events

The service emits various events during operation:

- `start` - Operation begins
- `pass_start` - New pass starts
- `progress` - Progress update (includes percentage, speed)
- `pass_complete` - Pass completes
- `complete` - Operation finishes
- `error` - Error occurs
- `info` - Informational message

### Configuration Options

```typescript
interface SecureWipeConfig {
  target: string;           // File or device path
  algorithm: WipeAlgorithm; // Wiping algorithm
  force?: boolean;          // Skip confirmations
  bufferSize?: number;      // Buffer size in KB
  demo?: boolean;           // Demo mode (creates temp file)
  demoSize?: number;        // Demo file size in MB
}
```

### Supported Algorithms

- `random` - Cryptographically secure random data (1 pass)
- `zeros` - Fill with zeros (1 pass)
- `ones` - Fill with ones/0xFF (1 pass)
- `dod5220` - US DoD 5220.22-M standard (3 passes)
- `gutmann` - Gutmann method (35 passes)

## Security Considerations

The service implements several security measures:

### Path Validation
- Prevents directory traversal attacks (`../`, `~`)
- Validates absolute paths
- Checks for null byte injection
- Verifies file existence for regular files

### Block Device Handling
- Detects Unix (`/dev/`) and Windows (`\\\\.\\`) block devices
- Requires elevated privileges for partition wiping
- Additional warnings for entire disk operations

### Safe Operation Checks
- Prevents wiping system directories
- Warns about dangerous operations
- Validates buffer sizes and demo file sizes
- Generates audit logs for operations

## Binary Requirements

The service expects the `secure-wipe-bin` executable to be available. The service will look for it in:

1. `../assets/secure-wipe-bin[.exe]` (relative to main process)
2. `{resourcesPath}/assets/secure-wipe-bin[.exe]` (packaged app)
3. `./bin/secure-wipe-bin[.exe]` (local bin directory)
4. System PATH

## Error Handling

The service provides comprehensive error handling:

```typescript
try {
  const result = await secureWipeService.wipeTarget(config);
  if (!result.success) {
    console.error('Operation failed:', result.error);
  }
} catch (error) {
  console.error('Service error:', error.message);
}
```

Errors can occur at multiple levels:
- Service-level errors (binary not found, invalid config)
- Process-level errors (spawn failures, timeouts)
- Binary-level errors (permission denied, I/O errors)

## Utilities

The `SecureWipeUtils` class provides helpful utilities:

```typescript
import { SecureWipeUtils } from './utils/secure-wipe.utils';

// Validate file path
const validation = SecureWipeUtils.validateFilePath('/path/to/file');
if (!validation.valid) {
  console.error(validation.error);
}

// Format file sizes
const sizeStr = SecureWipeUtils.formatFileSize(1024 * 1024); // "1 MB"

// Get algorithm info
const info = SecureWipeUtils.getAlgorithmInfo('dod5220');
console.log(`${info.name}: ${info.passes} passes - ${info.description}`);

// Estimate operation time
const estimate = SecureWipeUtils.estimateOperationTime(1024*1024*100, 'gutmann');
console.log(`Estimated time: ${estimate}`);
```

## Demo Application

The included demo component (`SecureWipeDemo.tsx`) shows a complete integration example with:

- Binary status checking
- Drive listing
- File selection
- Algorithm selection
- Real-time progress display
- Operation logging
- Error handling

To view the demo, navigate to `/demo` in the renderer process.

## Development

### Building
```bash
npm run build
```

### Running in Development
```bash
npm start
```

The service will automatically handle development vs production environments and adjust binary paths accordingly.

### Testing

For testing without the actual binary, use demo mode:

```typescript
const result = await secureWipeService.wipeTarget({
  target: '', // Not used in demo
  algorithm: 'random',
  demo: true,
  demoSize: 10, // 10 MB test file
  force: true
});
```

## Integration Notes

1. **Binary Placement**: Ensure the secure-wipe binary is included in your app package
2. **Permissions**: Partition wiping requires administrator/root privileges
3. **User Confirmation**: Always confirm destructive operations with users
4. **Error Handling**: Implement proper error handling and user feedback
5. **Logging**: Consider implementing audit logging for security operations
6. **Validation**: Use the provided validation utilities before operations

## License

This service integration follows the same license as the main project.