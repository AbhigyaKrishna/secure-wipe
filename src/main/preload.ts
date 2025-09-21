// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'secure-wipe:progress';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  secureWipe: {
    wipe: (config: any) => ipcRenderer.invoke('secure-wipe:wipe', config),
    wipeWithPrivileges: (config: any) =>
      ipcRenderer.invoke('secure-wipe:wipe-with-privileges', config),
    listDrives: () => ipcRenderer.invoke('secure-wipe:list-drives'),
    getSystemInfo: () => ipcRenderer.invoke('secure-wipe:get-system-info'),
    cancel: () => ipcRenderer.invoke('secure-wipe:cancel'),
    checkBinary: () => ipcRenderer.invoke('secure-wipe:check-binary'),
    findBinary: () => ipcRenderer.invoke('secure-wipe:find-binary'),
    isActive: () => ipcRenderer.invoke('secure-wipe:is-active'),
    checkPrivileges: (targetPath?: string) =>
      ipcRenderer.invoke('secure-wipe:check-privileges', targetPath),
    validateBinaryAccess: () =>
      ipcRenderer.invoke('secure-wipe:validate-binary-access'),
    supportsGuiPrompts: () =>
      ipcRenderer.invoke('secure-wipe:supports-gui-prompts'),
    getElevationDescription: (targetPath?: string) =>
      ipcRenderer.invoke('secure-wipe:get-elevation-description', targetPath),
    onProgress: (callback: (event: any) => void) => {
      const subscription = (_event: IpcRendererEvent, event: any) =>
        callback(event);
      ipcRenderer.on('secure-wipe:progress', subscription);
      return () =>
        ipcRenderer.removeListener('secure-wipe:progress', subscription);
    },
  },
  api: {
    login: (request: { email: string; password: string }) =>
      ipcRenderer.invoke('api:login', request),
    verifyDigiLocker: (request: { email: string; verificationCode: string }) =>
      ipcRenderer.invoke('api:verify-digilocker', request),
    resendVerification: (request: { email: string }) =>
      ipcRenderer.invoke('api:resend-verification', request),
    testHandlers: () => ipcRenderer.invoke('test-api-handlers'),
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
