const { app, BrowserWindow, ipcMain, screen, Menu, shell } = require('electron');
const path = require('path');
const loudness = require('loudness');
const fs = require('fs');

let mainWindow;
let mascotWindow;
let isModeActive = false;
let previousVolume = 50;

// Allow microphone access without prompts
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

// --- SINGLE INSTANCE LOCK ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        
        // If it was launched via the shortcut
        if (commandLine.includes('--shout-mode')) {
            toggleScreamingMode();
        } else {
            if (mainWindow) {
                if (!mainWindow.isVisible()) mainWindow.show();
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
            } else {
                createMainWindow(true);
            }
        }
    });

    app.whenReady().then(() => {
        const isShoutMode = process.argv.includes('--shout-mode');
        
        createMainWindow(!isShoutMode);

        // Check if the *first* instance was launched with the shortcut
        if (isShoutMode) {
            // Wait for main window to load then toggle
            setTimeout(() => {
                if (!isModeActive) toggleScreamingMode();
            }, 500);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createMainWindow(true);
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

function createMainWindow(show = true) {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: show,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
    
    // Devtools are disabled by default now.
    // if (show) {
    //     mainWindow.webContents.openDevTools();
    // }
    
    // When the main window closes, restore volume and quit the entire app
    mainWindow.on('close', () => {
        if (isModeActive) {
            loudness.setVolume(previousVolume).catch(() => {});
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        app.quit(); // Force quit to close mascot and exit
    });
}

function createMascotWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    
    mascotWindow = new BrowserWindow({
        width: 250,
        height: 250,
        x: width - 250 - 20, // Bottom right corner
        y: height - 250 - 20,
        transparent: true,
        frame: false,
        icon: path.join(__dirname, 'icon.ico'),
        alwaysOnTop: true,
        resizable: false,
        focusable: false, // Click-through essentially, though we might want dragging
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mascotWindow.loadFile('mascot.html');
}

// ---- IPC Communication ----

function stopScreamingMode() {
    if (!isModeActive) return;
    isModeActive = false;
    if (mascotWindow) {
        mascotWindow.close();
        mascotWindow = null;
    }
    loudness.setVolume(previousVolume).catch(() => {});
    if (mainWindow) {
        mainWindow.webContents.send('mode-status', false);
        if (!mainWindow.isVisible()) {
            app.quit();
        }
    }
}

async function toggleScreamingMode() {
    if (isModeActive) {
        stopScreamingMode();
    } else {
        isModeActive = true;
        try {
            previousVolume = await loudness.getVolume();
            await loudness.setVolume(10); 
        } catch (e) { console.error(e); }
        
        createMascotWindow();
        if (mainWindow) mainWindow.webContents.send('mode-status', true);
    }
}

ipcMain.on('show-mascot-context-menu', (event) => {
    const template = [
        {
            label: 'Stop Screaming Mode',
            click: () => {
                stopScreamingMode();
            }
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('toggle-screaming-mode', async (event) => {
    await toggleScreamingMode();
});

ipcMain.on('spawn-desktop-widget', () => {
    try {
        const desktopPath = app.getPath('desktop');
        const shortcutPath = path.join(desktopPath, 'Shout Me.lnk');
        const iconPath = path.join(__dirname, 'icon.ico');

        const isPackaged = app.isPackaged;
        const appPath = app.getAppPath();
        const args = isPackaged ? '--shout-mode' : `"${appPath}" --shout-mode`;

        const options = {
            target: process.execPath,
            args: args,
            description: 'Activate Shout Mode'
        };

        if (fs.existsSync(iconPath)) {
            options.icon = iconPath;
            options.iconIndex = 0;
        }

        shell.writeShortcutLink(shortcutPath, 'create', options);
        console.log("Created shortcut at", shortcutPath);
        
        // Notify the UI it was successful
        if (mainWindow) {
            mainWindow.webContents.executeJavaScript(`alert('Shortcut created on your Desktop!')`).catch(()=>{});
        }
    } catch (err) {
        console.error("Failed to create shortcut:", err);
    }
});

// Receive volume level from mascot's microphone analysis
let isUpdatingVolume = false;

ipcMain.on('mic-volume', async (event, volumeFraction) => {
    if (!isModeActive) return;
    if (isUpdatingVolume) return;
    
    // volumeFraction is 0.0 to 1.0 from the audio loop
    // Map to system volume 10 to 100
    const targetVolume = Math.round(10 + (volumeFraction * 90));
    
    try {
        isUpdatingVolume = true;
        await loudness.setVolume(targetVolume);
    } catch (e) {
        // Ignore rapid set errors
    } finally {
        isUpdatingVolume = false;
    }
});
