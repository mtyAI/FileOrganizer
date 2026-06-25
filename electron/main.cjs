const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = process.argv.includes("--dev");
const BACKUP_DIR = "_file-organizer-backup";
const BACKUP_DIRS = [BACKUP_DIR, "_asset-organizer-backup"];

app.setName("FileOrganizer");

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: `${app.name}について` },
              { type: "separator" },
              { role: "services", label: "サービス" },
              { type: "separator" },
              { role: "hide", label: `${app.name}を隠す` },
              { role: "hideOthers", label: "ほかを隠す" },
              { role: "unhide", label: "すべて表示" },
              { type: "separator" },
              { role: "quit", label: `${app.name}を終了` }
            ]
          }
        ]
      : []),
    {
      label: "ファイル",
      submenu: [
        isMac ? { role: "close", label: "ウィンドウを閉じる" } : { role: "quit", label: "終了" }
      ]
    },
    {
      label: "編集",
      submenu: [
        { role: "undo", label: "元に戻す" },
        { role: "redo", label: "やり直す" },
        { type: "separator" },
        { role: "cut", label: "切り取り" },
        { role: "copy", label: "コピー" },
        { role: "paste", label: "貼り付け" },
        { role: "selectAll", label: "すべて選択" }
      ]
    },
    {
      label: "表示",
      submenu: [
        { role: "reload", label: "再読み込み" },
        { role: "forceReload", label: "強制再読み込み" },
        { role: "toggleDevTools", label: "開発者ツール" },
        { type: "separator" },
        { role: "resetZoom", label: "実際のサイズ" },
        { role: "zoomIn", label: "拡大" },
        { role: "zoomOut", label: "縮小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "全画面表示" }
      ]
    },
    {
      label: "ウィンドウ",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "ズーム" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front", label: "すべてを前面へ" }
            ]
          : [{ role: "close", label: "閉じる" }])
      ]
    },
    {
      label: "ヘルプ",
      submenu: [
        { role: "about", label: "FileOrganizerについて" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 720,
    title: "FileOrganizer",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  buildApplicationMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function toRelative(rootPath, filePath) {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function normalizeFolderPattern(value) {
  return String(value ?? "").trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function shouldSkipFolder(folderName, relativePath, excludedFolders) {
  const normalizedName = folderName.toLowerCase();
  const normalizedPath = normalizeFolderPattern(relativePath).toLowerCase();
  return excludedFolders.some((folder) => {
    const pattern = normalizeFolderPattern(folder).toLowerCase();
    return pattern && (pattern === normalizedName || pattern === normalizedPath);
  });
}

async function scanDirectory(rootPath, targetFolders, excludedFolders = [], currentPath = rootPath) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      const relativePath = toRelative(rootPath, absolutePath);
      if (
        BACKUP_DIRS.includes(entry.name) ||
        shouldSkipFolder(entry.name, relativePath, targetFolders) ||
        shouldSkipFolder(entry.name, relativePath, excludedFolders)
      ) {
        continue;
      }
      files.push(...(await scanDirectory(rootPath, targetFolders, excludedFolders, absolutePath)));
      continue;
    }

    if (!entry.isFile()) continue;
    const stat = await fs.stat(absolutePath);
    const relativePath = toRelative(rootPath, absolutePath);
    const folderPath = path.dirname(relativePath).replaceAll("\\", "/");
    files.push({
      id: `${relativePath}:${stat.size}:${stat.mtimeMs}`,
      name: entry.name,
      folderPath: folderPath === "." ? "/" : folderPath,
      currentPath: relativePath,
      absolutePath,
      size: stat.size,
      lastModified: stat.mtimeMs,
      ext: path.extname(entry.name).slice(1).toLowerCase(),
      source: "electron"
    });
  }

  return files;
}

async function uniquePath(targetPath) {
  try {
    await fs.access(targetPath);
  } catch {
    return targetPath;
  }

  const dir = path.dirname(targetPath);
  const parsed = path.parse(targetPath);
  let index = 2;
  while (true) {
    const candidate = path.join(dir, `${parsed.name}（${index}）${parsed.ext}`);
    try {
      await fs.access(candidate);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function moveFile(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  const finalDestination = await uniquePath(destinationPath);
  try {
    await fs.rename(sourcePath, finalDestination);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await fs.copyFile(sourcePath, finalDestination);
    await fs.unlink(sourcePath);
  }
  return finalDestination;
}

async function copyFile(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

function assertInside(rootPath, candidatePath, label) {
  const relative = path.relative(rootPath, candidatePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} is outside the selected folder`);
  }
}

function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

ipcMain.handle("asset-organizer:select-folder", async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    title: "整理する素材フォルダを選択",
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  const rootPath = result.filePaths[0];
  const files = await scanDirectory(rootPath, options.targetFolders ?? [], options.excludedFolders ?? []);
  return {
    canceled: false,
    rootPath,
    folderName: path.basename(rootPath),
    files
  };
});

ipcMain.handle("asset-organizer:select-output-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "出力先フォルダを選択",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  const outputPath = result.filePaths[0];
  return {
    canceled: false,
    outputPath,
    folderName: path.basename(outputPath)
  };
});

ipcMain.handle("asset-organizer:scan-folder", async (_event, options = {}) => {
  if (!options.rootPath) throw new Error("rootPath is required");
  const rootPath = path.resolve(options.rootPath);
  const files = await scanDirectory(rootPath, options.targetFolders ?? [], options.excludedFolders ?? []);
  return {
    rootPath,
    folderName: path.basename(rootPath),
    files
  };
});

ipcMain.handle("asset-organizer:run-plan", async (_event, payload = {}) => {
  const rootPath = payload.sourceRootPath ?? payload.rootPath;
  const outputRootPath = payload.outputRootPath || rootPath;
  const files = payload.files ?? [];
  if (!rootPath) throw new Error("rootPath is required");

  const rootAbsolute = path.resolve(rootPath);
  const outputAbsolute = path.resolve(outputRootPath);
  const backupRoot = path.join(rootAbsolute, BACKUP_DIR, backupStamp());
  const operations = [];

  for (const file of files) {
    if (!file.currentPath || !file.destinationName || !file.category?.folder) continue;
    const sourcePath = path.resolve(rootAbsolute, file.currentPath);
    assertInside(rootAbsolute, sourcePath, "source path");

    const destinationPath = path.resolve(outputAbsolute, file.category.folder, path.basename(file.destinationName));
    assertInside(outputAbsolute, destinationPath, "destination path");
    const backupPath = path.join(backupRoot, file.currentPath);
    await copyFile(sourcePath, backupPath);
    const finalDestination = await moveFile(sourcePath, destinationPath);
    operations.push({
      source: sourcePath,
      destination: finalDestination,
      backup: backupPath,
      sourceRelative: toRelative(rootAbsolute, sourcePath),
      destinationRelative: toRelative(outputAbsolute, finalDestination),
      backupRelative: toRelative(rootAbsolute, backupPath)
    });
  }

  return {
    operations,
    backupRoot,
    backupRootRelative: toRelative(rootAbsolute, backupRoot)
  };
});

ipcMain.handle("asset-organizer:undo", async (_event, payload = {}) => {
  const rootPath = payload.rootPath;
  const operations = payload.operations ?? [];
  if (!rootPath) throw new Error("rootPath is required");

  const rootAbsolute = path.resolve(rootPath);
  const restored = [];
  for (const operation of operations.slice().reverse()) {
    const finalPath = await moveFile(operation.destination, operation.source);
    restored.push({
      source: operation.destination,
      destination: finalPath,
      destinationRelative: toRelative(rootAbsolute, finalPath)
    });
  }

  return { restored };
});

ipcMain.handle("asset-organizer:delete-backups", async (_event, payload = {}) => {
  const rootPath = payload.rootPath;
  if (!rootPath) throw new Error("rootPath is required");

  const rootAbsolute = path.resolve(rootPath);
  const deletedRoots = [];

  for (const backupDir of BACKUP_DIRS) {
    const backupRoot = path.join(rootAbsolute, backupDir);
    assertInside(rootAbsolute, backupRoot, "backup path");

    try {
      await fs.access(backupRoot);
    } catch {
      continue;
    }

    await fs.rm(backupRoot, { recursive: true, force: true });
    deletedRoots.push(backupDir);
  }

  return {
    deleted: deletedRoots.length > 0,
    backupRoot: path.join(rootAbsolute, BACKUP_DIR),
    backupRootRelative: deletedRoots.join(", ") || BACKUP_DIR
  };
});
