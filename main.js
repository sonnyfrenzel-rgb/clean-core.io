const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow;
let mobileWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    titleBarStyle: 'hidden', // Sleek borderless window frame
    titleBarOverlay: {
      color: '#0f172a', // slate-900 matching the premium deep theme of Clean-Core
      symbolColor: '#10b981', // emerald-500 matching the accents
      height: 40
    },
    backgroundColor: '#090d16', // Dark background to prevent white flashing
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Hardcode to local Next.js server (port 3000) to guarantee only local development state is loaded
  const targetUrl = 'http://localhost:3000';

  const loadApp = () => {
    mainWindow.loadURL(targetUrl).catch(() => {
      console.log(`Local Next.js server at ${targetUrl} not ready yet, retrying in 1s...`);
      setTimeout(loadApp, 1000);
    });
  };
  
  loadApp();

  // Open DevTools and side-by-side Mobile Companion Window in development mode
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.webContents.openDevTools();

    // Create smartphone-dimensioned companion window (iPhone 13/14 viewport size)
    mobileWindow = new BrowserWindow({
      width: 390,
      height: 844,
      minWidth: 320,
      minHeight: 568,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#0f172a',
        symbolColor: '#10b981',
        height: 35
      },
      backgroundColor: '#090d16',
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    const loadMobileApp = () => {
      mobileWindow.loadURL(targetUrl).catch(() => {
        setTimeout(loadMobileApp, 1000);
      });
    };
    
    loadMobileApp();

    // Position mobile window 20px to the right of the main desktop window
    mainWindow.once('ready-to-show', () => {
      const [mainX, mainY] = mainWindow.getPosition();
      const mainWidth = mainWindow.getSize()[0];
      mobileWindow.setPosition(mainX + mainWidth + 20, mainY);
    });

    mobileWindow.on('closed', () => {
      mobileWindow = null;
    });

    // Enable standard keyboard shortcuts (Reload, DevTools) for the borderless mobile window
    mobileWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        if (((input.control || input.meta) && input.key.toLowerCase() === 'r') || input.key === 'F5') {
          mobileWindow.reload();
          event.preventDefault();
        }
        if (((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
          mobileWindow.webContents.toggleDevTools();
          event.preventDefault();
        }
      }
    });
  }

  // Enable standard keyboard shortcuts (Reload, DevTools, Zoom) for custom borderless titlebars
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // Reload (Ctrl+R, Cmd+R, F5)
      if (((input.control || input.meta) && input.key.toLowerCase() === 'r') || input.key === 'F5') {
        mainWindow.reload();
        event.preventDefault();
      }
      // DevTools (Ctrl+Shift+I, Cmd+Alt+I, F12)
      if (((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });

  // Open all external links in the default browser, but allow Firebase Auth popups to open inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('firebaseapp.com') || url.includes('/__/auth/')) {
      return { action: 'allow' };
    }
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (mobileWindow) {
      mobileWindow.close();
    }
  });
}

// Single instance lock to prevent launching multiple windows
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
