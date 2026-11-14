# Nexus AI

Nexus AI is a lightweight Linux desktop browser for using AI websites with their normal websites and accounts. It does not use API keys, an AI backend, or local language models. Each provider runs in its own persistent Electron session, so sign-ins and site data remain separate.

## Requirements

- Linux x64 desktop
- Node.js 20 or newer and npm
- For graphical Linux systems, the shared libraries required by Electron (including GTK 3, libnotify, and libnss3)

## Install and run

```sh
npm install
npm run dev
```

The first launch opens the six included providers. Sign in directly on each website. Nexus AI does not ask for or store website passwords. `npm start` also compiles the app and launches it.

## Using Nexus AI

- Select a provider in the sidebar. Its website view stays open when you switch away and its sign-in is saved in a provider-specific persistent session.
- Use the toolbar to navigate backward or forward, refresh the site, or open the current page in your default browser.
- Open **Settings** to choose a theme, edit or remove providers, or clear a provider's saved cookies and website data.
- Add custom providers using an HTTPS website address. Website providers are regular browser sessions; sites may restrict embedded use or require you to continue in your external browser.

Provider definitions and theme are saved in Electron's application user-data directory. Website session data is stored separately by Electron for each provider in that same user-data area. Removing a provider clears its saved site data.

## Build a Linux application

```sh
npm run build
```

This compiles the TypeScript sources and creates a Linux AppImage under `release/`. Make the AppImage executable and launch it:

```sh
chmod +x release/*.AppImage
./release/*.AppImage
```

To run the focused provider-validation tests:

```sh
npm test
```

## Security and privacy

Website views use separate `persist:` session partitions with context isolation, sandboxing, web security, and Node integration disabled. The application does not inject scripts into provider websites, bypass their authentication or security controls, or transmit your website credentials.
