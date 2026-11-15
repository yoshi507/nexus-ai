type Provider = { id: string; name: string; url: string };
type Theme = 'dark' | 'light' | 'system';
type AppState = { providers: Provider[]; theme: Theme; activeProviderId: string };
type ProviderState = {
  providerId: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  url: string;
  error?: string;
};

interface Window {
  nexus: {
    getAppState: () => Promise<AppState>;
    switchProvider: (providerId: string) => Promise<void>;
    addProvider: (provider: { name: string; url: string }) => Promise<Provider>;
    updateProvider: (provider: Provider) => Promise<Provider>;
    removeProvider: (providerId: string) => Promise<Provider[]>;
    openExternal: () => Promise<void>;
    refreshProvider: () => Promise<void>;
    navigateProvider: (direction: 'back' | 'forward') => Promise<void>;
    setViewBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
    setTheme: (theme: Theme) => Promise<void>;
    setSettingsOpen: (isOpen: boolean) => Promise<void>;
    clearProviderSession: (providerId: string) => Promise<void>;
    onAppState: (callback: (state: AppState) => void) => () => void;
    onProviderState: (callback: (state: ProviderState) => void) => () => void;
  }
}

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing interface element: ${id}`);
  return element as T;
};

let providers: Provider[] = [];
let currentProviderId = '';
let editingProviderId: string | null = null;

const providerIcons: Record<string, string> = {
  chatgpt: '✳',
  grok: '𝕏',
  gemini: '✦',
  claude: '✳',
  perplexity: '⌕',
  copilot: '◉'
};

function showToast(message: string, isError = false): void {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 4200);
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  byId<HTMLSelectElement>('theme-select').value = theme;
}

function drawProviders(): void {
  const list = byId('providers-list');
  list.replaceChildren();
  for (const provider of providers) {
    const button = document.createElement('button');
    button.className = `provider-item${provider.id === currentProviderId ? ' active' : ''}`;
    button.type = 'button';
    button.title = provider.url;
    button.setAttribute('aria-current', provider.id === currentProviderId ? 'page' : 'false');

    const icon = document.createElement('span');
    icon.className = 'provider-icon';
    icon.textContent = providerIcons[provider.id] ?? provider.name.trim().charAt(0).toUpperCase();
    const name = document.createElement('span');
    name.className = 'provider-name';
    name.textContent = provider.name;
    button.append(icon, name);
    button.addEventListener('click', () => void activateProvider(provider.id));
    list.append(button);
  }
  const selected = providers.find((provider) => provider.id === currentProviderId);
  byId('current-provider-name').textContent = selected?.name ?? 'Choose a website';
  byId('empty-state').classList.toggle('visible', providers.length === 0);
  byId('provider-actions').classList.toggle('hidden', providers.length === 0);
  drawManagedProviders();
}

async function activateProvider(providerId: string): Promise<void> {
  if (!providers.some((provider) => provider.id === providerId)) return;
  currentProviderId = providerId;
  drawProviders();
  byId('site-error').classList.remove('visible');
  byId('loading-indicator').classList.add('visible');
  try {
    await window.nexus.switchProvider(providerId);
    updateViewBounds();
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to open this provider.', true);
  }
}

function drawManagedProviders(): void {
  const list = byId('managed-providers-list');
  list.replaceChildren();
  for (const provider of providers) {
    const row = document.createElement('div');
    row.className = 'managed-provider';
    const details = document.createElement('div');
    details.className = 'managed-provider-details';
    const name = document.createElement('strong');
    name.textContent = provider.name;
    const url = document.createElement('span');
    url.textContent = provider.url;
    details.append(name, url);

    const actions = document.createElement('div');
    actions.className = 'managed-actions';
    const edit = document.createElement('button');
    edit.className = 'icon-button';
    edit.type = 'button';
    edit.title = `Edit ${provider.name}`;
    edit.setAttribute('aria-label', `Edit ${provider.name}`);
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openProviderForm(provider));
    const clear = document.createElement('button');
    clear.className = 'icon-button';
    clear.type = 'button';
    clear.title = `Clear ${provider.name} session`;
    clear.setAttribute('aria-label', `Clear ${provider.name} session`);
    clear.textContent = 'Sign out';
    clear.addEventListener('click', () => void clearSession(provider));
    const remove = document.createElement('button');
    remove.className = 'icon-button danger-text';
    remove.type = 'button';
    remove.title = `Remove ${provider.name}`;
    remove.setAttribute('aria-label', `Remove ${provider.name}`);
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => void removeProvider(provider));
    actions.append(edit, clear, remove);
    row.append(details, actions);
    list.append(row);
  }
}

async function clearSession(provider: Provider): Promise<void> {
  if (!window.confirm(`Sign out of ${provider.name} on this device? Its saved website data will be cleared.`)) return;
  try {
    await window.nexus.clearProviderSession(provider.id);
    showToast(`${provider.name} session cleared.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not clear this website session.', true);
  }
}

async function removeProvider(provider: Provider): Promise<void> {
  if (!window.confirm(`Remove ${provider.name} and clear its saved sign-in and website data?`)) return;
  try {
    providers = await window.nexus.removeProvider(provider.id);
    if (provider.id === currentProviderId) {
      currentProviderId = providers[0]?.id ?? '';
      if (currentProviderId) await window.nexus.switchProvider(currentProviderId);
    }
    drawProviders();
    updateViewBounds();
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not remove this provider.', true);
  }
}

function openProviderForm(provider?: Provider): void {
  editingProviderId = provider?.id ?? null;
  byId('provider-form-title').textContent = provider ? 'Edit website' : 'Add website';
  byId<HTMLInputElement>('provider-name').value = provider?.name ?? '';
  byId<HTMLInputElement>('provider-url').value = provider?.url ?? '';
  byId('settings-view').classList.add('hidden');
  byId('provider-form-view').classList.remove('hidden');
  byId('provider-name').focus();
}

function closeProviderForm(): void {
  byId('provider-form-view').classList.add('hidden');
  byId('settings-view').classList.remove('hidden');
  editingProviderId = null;
}

function updateViewBounds(): void {
  const rect = byId('web-content').getBoundingClientRect();
  void window.nexus.setViewBounds({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  });
}

function showProviderState(state: ProviderState): void {
  if (state.providerId !== currentProviderId) return;
  byId('loading-indicator').classList.toggle('visible', state.loading);
  byId('back-button').toggleAttribute('disabled', !state.canGoBack);
  byId('forward-button').toggleAttribute('disabled', !state.canGoForward);
  if (state.url) {
    try {
      byId('site-address').textContent = new URL(state.url).hostname;
    } catch {
      byId('site-address').textContent = '';
    }
  }
  if (state.error) {
    byId('site-error-message').textContent =
      `This website could not be loaded: ${state.error}. Check your internet connection, or open the site in your browser.`;
    byId('site-error').classList.add('visible');
    byId('loading-indicator').classList.remove('visible');
  } else {
    byId('site-error').classList.remove('visible');
  }
}

function setSettingsOpen(isOpen: boolean): void {
  byId('settings-modal').classList.toggle('visible', isOpen);
  void window.nexus.setSettingsOpen(isOpen).catch((error: unknown) =>
    showToast(error instanceof Error ? error.message : 'Could not change settings visibility.', true));
}

byId('settings-button').addEventListener('click', () => {
  setSettingsOpen(true);
  byId('settings-view').classList.remove('hidden');
  byId('provider-form-view').classList.add('hidden');
  drawManagedProviders();
});
byId('close-settings').addEventListener('click', () => setSettingsOpen(false));
byId('close-settings-form').addEventListener('click', () => {
  closeProviderForm();
  setSettingsOpen(false);
});
byId('settings-modal').addEventListener('click', (event) => {
  if (event.target === byId('settings-modal')) setSettingsOpen(false);
});
byId('add-provider-button').addEventListener('click', () => {
  setSettingsOpen(true);
  openProviderForm();
});
byId('provider-form-cancel').addEventListener('click', closeProviderForm);
byId<HTMLFormElement>('provider-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const isEditing = editingProviderId !== null;
  const name = byId<HTMLInputElement>('provider-name').value.trim();
  const url = byId<HTMLInputElement>('provider-url').value.trim();
  try {
    if (editingProviderId) {
      const updated = await window.nexus.updateProvider({ id: editingProviderId, name, url });
      providers = providers.map((provider) => provider.id === updated.id ? updated : provider);
    } else {
      const added = await window.nexus.addProvider({ name, url });
      providers = [...providers, added];
      await activateProvider(added.id);
      setSettingsOpen(false);
    }
    drawProviders();
    closeProviderForm();
    showToast(isEditing ? 'Website updated.' : 'Website added.');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not save this website.', true);
  }
});
byId<HTMLSelectElement>('theme-select').addEventListener('change', async (event) => {
  const theme = (event.currentTarget as HTMLSelectElement).value as Theme;
  try {
    await window.nexus.setTheme(theme);
    applyTheme(theme);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not save the theme.', true);
  }
});
byId('back-button').addEventListener('click', () => void window.nexus.navigateProvider('back'));
byId('forward-button').addEventListener('click', () => void window.nexus.navigateProvider('forward'));
byId('refresh-button').addEventListener('click', () => void window.nexus.refreshProvider());
byId('external-button').addEventListener('click', () => {
  void window.nexus.openExternal().catch((error: unknown) =>
    showToast(error instanceof Error ? error.message : 'Could not open the external browser.', true));
});
byId('error-external-button').addEventListener('click', () => {
  void window.nexus.openExternal().catch((error: unknown) =>
    showToast(error instanceof Error ? error.message : 'Could not open the external browser.', true));
});
byId('sidebar-settings').addEventListener('click', () => byId('settings-button').click());
byId('empty-add-provider').addEventListener('click', () => {
  setSettingsOpen(true);
  openProviderForm();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && byId('settings-modal').classList.contains('visible')) {
    setSettingsOpen(false);
  }
});

window.nexus.onAppState((state) => {
  providers = state.providers;
  if (!providers.some((provider) => provider.id === currentProviderId)) {
    currentProviderId = state.activeProviderId;
  }
  applyTheme(state.theme);
  drawProviders();
  updateViewBounds();
});
window.nexus.onProviderState(showProviderState);
window.addEventListener('resize', updateViewBounds);
new ResizeObserver(updateViewBounds).observe(byId('web-content'));

void window.nexus.getAppState().then(async (state) => {
  providers = state.providers;
  currentProviderId = state.activeProviderId;
  applyTheme(state.theme);
  drawProviders();
  if (currentProviderId) await activateProvider(currentProviderId);
}).catch((error: unknown) => {
  showToast(error instanceof Error ? error.message : 'Nexus AI could not initialize.', true);
});
