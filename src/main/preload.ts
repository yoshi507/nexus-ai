import { contextBridge, ipcRenderer } from 'electron';

type Provider = { id: string; name: string; url: string };
type AppState = {
  providers: Provider[];
  theme: 'dark' | 'light' | 'system';
  activeProviderId: string;
};
type ProviderState = {
  providerId: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  url: string;
  error?: string;
};

contextBridge.exposeInMainWorld('nexus', {
  getAppState: (): Promise<AppState> => ipcRenderer.invoke('get-app-state'),
  switchProvider: (providerId: string): Promise<void> => ipcRenderer.invoke('switch-provider', providerId),
  addProvider: (provider: { name: string; url: string }): Promise<Provider> =>
    ipcRenderer.invoke('add-provider', provider),
  updateProvider: (provider: Provider): Promise<Provider> => ipcRenderer.invoke('update-provider', provider),
  removeProvider: (providerId: string): Promise<Provider[]> => ipcRenderer.invoke('remove-provider', providerId),
  openExternal: (): Promise<void> => ipcRenderer.invoke('open-external'),
  refreshProvider: (): Promise<void> => ipcRenderer.invoke('refresh-provider'),
  navigateProvider: (direction: 'back' | 'forward'): Promise<void> =>
    ipcRenderer.invoke('navigate-provider', direction),
  setViewBounds: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('set-view-bounds', bounds),
  setTheme: (theme: AppState['theme']): Promise<void> => ipcRenderer.invoke('set-theme', theme),
  setSettingsOpen: (isOpen: boolean): Promise<void> => ipcRenderer.invoke('set-settings-open', isOpen),
  clearProviderSession: (providerId: string): Promise<void> =>
    ipcRenderer.invoke('clear-provider-session', providerId),
  onAppState: (callback: (state: AppState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState): void => callback(state);
    ipcRenderer.on('app-state', listener);
    return () => ipcRenderer.removeListener('app-state', listener);
  },
  onProviderState: (callback: (state: ProviderState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ProviderState): void => callback(state);
    ipcRenderer.on('provider-state', listener);
    return () => ipcRenderer.removeListener('provider-state', listener);
  }
});
