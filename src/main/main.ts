import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  WebContentsView,
  type Rectangle,
  type Session
} from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { defaultProviders, isValidUrl, normalizeProvider, type Provider } from './providers';

type AppSettings = {
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

const settingsPath = (): string => path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): AppSettings {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (parsed && typeof parsed === 'object') {
      const saved = parsed as Partial<AppSettings>;
      if (Array.isArray(saved.providers)) {
        const providers = saved.providers.map((provider) => normalizeProvider(provider));
        if (new Set(providers.map((provider) => provider.id)).size !== providers.length) {
          throw new Error('Saved providers contain duplicate identifiers.');
        }
        return {
          providers,
          theme: saved.theme === 'light' || saved.theme === 'system' ? saved.theme : 'dark',
          activeProviderId: typeof saved.activeProviderId === 'string' ? saved.activeProviderId : ''
        };
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Unable to read Nexus AI settings; starting with defaults.', error);
    }
  }
  return { providers: [...defaultProviders], theme: 'dark', activeProviderId: 'chatgpt' };
}

let settings: AppSettings;
let mainWindow: BrowserWindow | null = null;
let activeProviderId = '';
let settingsViewOpen = false;
const providerViews = new Map<string, WebContentsView>();
const providerSessions = new Map<string, Session>();

function saveSettings(): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

function isTrustedRenderer(sender: Electron.WebContents): boolean {
  return mainWindow !== null && sender === mainWindow.webContents;
}

function emitProviderState(providerId: string, error?: string): void {
  const view = providerViews.get(providerId);
  if (!view || !mainWindow || mainWindow.isDestroyed()) return;
  const webContents = view.webContents;
  const state: ProviderState = {
    providerId,
    loading: webContents.isLoading(),
    canGoBack: webContents.canGoBack(),
    canGoForward: webContents.canGoForward(),
    url: webContents.getURL(),
    ...(error ? { error } : {})
  };
  mainWindow.webContents.send('provider-state', state);
}

function providerSession(providerId: string): Session {
  const existing = providerSessions.get(providerId);
  if (existing) return existing;
  const providerSession = session.fromPartition(`persist:nexus-${providerId}`);
  providerSessions.set(providerId, providerSession);
  return providerSession;
}

function ensureProviderView(provider: Provider): WebContentsView {
  const existing = providerViews.get(provider.id);
  if (existing) return existing;

  const view = new WebContentsView({
    webPreferences: {
      session: providerSession(provider.id),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false
    }
  });
  const contents = view.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    if (isValidUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isValidUrl(url)) event.preventDefault();
  });
  contents.on('did-start-loading', () => emitProviderState(provider.id));
  contents.on('did-stop-loading', () => emitProviderState(provider.id));
  contents.on('did-navigate', () => emitProviderState(provider.id));
  contents.on('did-navigate-in-page', () => emitProviderState(provider.id));
  contents.on('did-fail-load', (_event, code, description, _validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      emitProviderState(provider.id, `${description} (${code})`);
    }
  });

  providerViews.set(provider.id, view);
  if (mainWindow) mainWindow.contentView.addChildView(view);
  void contents.loadURL(provider.url).catch((error: unknown) => {
    emitProviderState(provider.id, error instanceof Error ? error.message : 'The website could not be loaded.');
  });
  return view;
}

function sendMainWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app-state', {
    providers: settings.providers,
    theme: settings.theme,
    activeProviderId
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-app-state', (event) => {
    if (!isTrustedRenderer(event.sender)) throw new Error('Unauthorized request.');
    return { providers: settings.providers, theme: settings.theme, activeProviderId };
  });

  ipcMain.handle('switch-provider', (event, providerId: unknown) => {
    if (!isTrustedRenderer(event.sender) || typeof providerId !== 'string') throw new Error('Invalid provider.');
    const provider = settings.providers.find((item) => item.id === providerId);
    if (!provider) throw new Error('Provider not found.');
    if (activeProviderId) providerViews.get(activeProviderId)?.setVisible(false);
    activeProviderId = providerId;
    const view = ensureProviderView(provider);
    view.setVisible(!settingsViewOpen);
    saveSettings();
    emitProviderState(providerId);
    sendMainWindowState();
  });

  ipcMain.handle('add-provider', (event, input: unknown) => {
    if (!isTrustedRenderer(event.sender)) throw new Error('Unauthorized request.');
    const provider = normalizeProvider(input);
    if (settings.providers.some((item) => item.id === provider.id)) throw new Error('Provider already exists.');
    settings.providers.push(provider);
    saveSettings();
    sendMainWindowState();
    return provider;
  });

  ipcMain.handle('update-provider', (event, input: unknown) => {
    if (!isTrustedRenderer(event.sender) || !input || typeof input !== 'object') {
      throw new Error('Invalid provider.');
    }
    const candidate = input as { id?: unknown };
    if (typeof candidate.id !== 'string') throw new Error('Invalid provider.');
    const index = settings.providers.findIndex((provider) => provider.id === candidate.id);
    if (index < 0) throw new Error('Provider not found.');
    const updated = normalizeProvider(input, candidate.id);
    settings.providers[index] = updated;
    const view = providerViews.get(updated.id);
    if (view && view.webContents.getURL() !== updated.url) {
      void view.webContents.loadURL(updated.url).catch((error: unknown) => {
        emitProviderState(updated.id, error instanceof Error ? error.message : 'The website could not be loaded.');
      });
    }
    saveSettings();
    sendMainWindowState();
    return updated;
  });

  ipcMain.handle('remove-provider', async (event, providerId: unknown) => {
    if (!isTrustedRenderer(event.sender) || typeof providerId !== 'string') throw new Error('Invalid provider.');
    const index = settings.providers.findIndex((provider) => provider.id === providerId);
    if (index < 0) throw new Error('Provider not found.');
    const storedSession = providerSession(providerId);
    await storedSession.clearStorageData();
    await storedSession.clearCache();
    providerSessions.delete(providerId);
    const view = providerViews.get(providerId);
    if (view) {
      mainWindow?.contentView.removeChildView(view);
      view.webContents.close();
      providerViews.delete(providerId);
    }
    settings.providers.splice(index, 1);
    if (activeProviderId === providerId) {
      activeProviderId = settings.providers[0]?.id ?? '';
    }
    saveSettings();
    sendMainWindowState();
    return settings.providers;
  });

  ipcMain.handle('open-external', async (event) => {
    if (!isTrustedRenderer(event.sender)) throw new Error('Unauthorized request.');
    const provider = settings.providers.find((item) => item.id === activeProviderId);
    if (!provider) throw new Error('No provider is selected.');
    const currentUrl = providerViews.get(provider.id)?.webContents.getURL();
    await shell.openExternal(isValidUrl(currentUrl) ? currentUrl : provider.url);
  });

  ipcMain.handle('refresh-provider', (event) => {
    if (!isTrustedRenderer(event.sender)) throw new Error('Unauthorized request.');
    providerViews.get(activeProviderId)?.webContents.reload();
  });

  ipcMain.handle('navigate-provider', (event, direction: unknown) => {
    if (!isTrustedRenderer(event.sender) || (direction !== 'back' && direction !== 'forward')) {
      throw new Error('Invalid navigation request.');
    }
    const contents = providerViews.get(activeProviderId)?.webContents;
    if (direction === 'back' && contents?.canGoBack()) contents.goBack();
    if (direction === 'forward' && contents?.canGoForward()) contents.goForward();
  });

  ipcMain.handle('set-view-bounds', (event, bounds: Partial<Rectangle>) => {
    if (!isTrustedRenderer(event.sender) || !bounds || typeof bounds !== 'object') return;
    const view = providerViews.get(activeProviderId);
    if (!view) return;
    const values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return;
    const [x, y, width, height] = values as number[];
    view.setBounds({
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(height))
    });
  });

  ipcMain.handle('set-theme', (event, theme: unknown) => {
    if (!isTrustedRenderer(event.sender) || (theme !== 'dark' && theme !== 'light' && theme !== 'system')) {
      throw new Error('Invalid theme.');
    }
    settings.theme = theme;
    saveSettings();
    sendMainWindowState();
  });

  ipcMain.handle('set-settings-open', (event, isOpen: unknown) => {
    if (!isTrustedRenderer(event.sender) || typeof isOpen !== 'boolean') {
      throw new Error('Invalid settings visibility.');
    }
    settingsViewOpen = isOpen;
    providerViews.get(activeProviderId)?.setVisible(!settingsViewOpen);
  });

  ipcMain.handle('clear-provider-session', async (event, providerId: unknown) => {
    if (!isTrustedRenderer(event.sender) || typeof providerId !== 'string' ||
      !settings.providers.some((provider) => provider.id === providerId)) {
      throw new Error('Invalid provider.');
    }
    const storedSession = providerSession(providerId);
    await storedSession.clearStorageData();
    await storedSession.clearCache();
    const view = providerViews.get(providerId);
    if (view) await view.webContents.reload();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('resize', () => {
    if (activeProviderId) emitProviderState(activeProviderId);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  settings = loadSettings();
  activeProviderId = settings.providers.some((provider) => provider.id === settings.activeProviderId)
    ? settings.activeProviderId
    : settings.providers[0]?.id ?? '';
  registerIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
