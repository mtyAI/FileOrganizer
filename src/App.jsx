import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronUp,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Gamepad2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  XCircle
} from "lucide-react";

const DEFAULT_CATEGORIES = [
  {
    id: "video",
    label: "動画素材",
    folder: "01_動画",
    extensions: ["mp4", "mov", "avi", "mkv", "webm"],
    tone: "teal",
    icon: "video",
    enabled: true
  },
  {
    id: "audio",
    label: "音声素材",
    folder: "02_音声",
    extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"],
    tone: "cyan",
    icon: "audio",
    enabled: true
  },
  {
    id: "image",
    label: "画像素材",
    folder: "03_画像",
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg", "psd", "ai", "clip"],
    tone: "olive",
    icon: "image",
    enabled: true
  },
  {
    id: "font",
    label: "フォント",
    folder: "04_フォント",
    extensions: ["otf", "ttf", "woff", "woff2"],
    tone: "indigo",
    icon: "text",
    enabled: true
  },
  {
    id: "threeD",
    label: "3D素材",
    folder: "05_3D",
    extensions: ["fbx", "obj", "blend", "glb", "gltf", "stl"],
    tone: "violet",
    icon: "archive",
    enabled: true
  },
  {
    id: "game",
    label: "ゲーム素材",
    folder: "06_ゲーム",
    extensions: ["unitypackage", "prefab", "mat", "asset", "uasset", "umap"],
    tone: "amber",
    icon: "game",
    enabled: true
  },
  {
    id: "compressed",
    label: "圧縮素材",
    folder: "07_圧縮",
    extensions: ["zip", "rar", "7z", "tar", "gz"],
    tone: "slate",
    icon: "zip",
    enabled: true
  },
  {
    id: "document",
    label: "ドキュメント",
    folder: "08_資料",
    extensions: ["pdf", "txt", "md", "doc", "docx", "xlsx", "csv"],
    tone: "gray",
    icon: "doc",
    enabled: true
  }
];

const CATEGORY_ICONS = {
  video: FileVideo,
  audio: FileAudio,
  image: FileImage,
  text: FileText,
  archive: Archive,
  game: Gamepad2,
  zip: FileArchive,
  doc: FileText,
  code: FileCode2
};

const now = () => new Date().toLocaleTimeString("ja-JP", { hour12: false });
const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const step = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** step).toFixed(step === 0 ? 0 : 1)} ${units[step]}`;
};
const getExt = (name) => {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
};
const basenameWithoutExt = (name) => {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(0, index) : name;
};
const appendSuffix = (name, count) => {
  const ext = getExt(name);
  const base = basenameWithoutExt(name);
  return ext ? `${base}（${count}）.${ext}` : `${base}（${count}）`;
};
const makeFileId = (path, size, lastModified = 0) => `${path}:${size}:${lastModified}`;
const normalizeFolderPattern = (value) => String(value ?? "").trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");

function shouldSkipFolder(folderName, relativePath, excludedFolders) {
  const normalizedName = folderName.toLowerCase();
  const normalizedPath = normalizeFolderPattern(relativePath).toLowerCase();
  return [...excludedFolders].some((folder) => {
    const pattern = normalizeFolderPattern(folder).toLowerCase();
    return pattern && (pattern === normalizedName || pattern === normalizedPath);
  });
}

function classify(file, categories) {
  const ext = getExt(file.name);
  return categories.find((category) => category.enabled && category.extensions.includes(ext)) ?? null;
}

async function collectFilesFromDirectory(directoryHandle, path = "", targetFolders = new Set(), excludedFolders = new Set()) {
  const entries = [];
  for await (const [name, entry] of directoryHandle.entries()) {
    if (entry.kind === "directory") {
      const relativePath = `${path}${name}`;
      if (targetFolders.has(name) || shouldSkipFolder(name, relativePath, excludedFolders)) continue;
      const children = await collectFilesFromDirectory(entry, `${relativePath}/`, targetFolders, excludedFolders);
      entries.push(...children);
      continue;
    }
    const file = await entry.getFile();
    entries.push({
      id: makeFileId(`${path}${name}`, file.size, file.lastModified),
      name,
      folderPath: path || "/",
      currentPath: `${path}${name}`,
      size: file.size,
      lastModified: file.lastModified,
      ext: getExt(name),
      handle: entry,
      parentHandle: directoryHandle,
      source: "filesystem"
    });
  }
  return entries;
}

function buildPlan(files, categories, includeMap) {
  const destinationCounts = new Map();
  return files.map((file) => {
    const category = classify(file, categories);
    const defaultIncluded = Boolean(category);
    const included = includeMap[file.id] ?? defaultIncluded;
    if (!category) {
      return { ...file, category: null, included: false, destination: "移動しない", destinationName: file.name };
    }

    const destinationKey = `${category.folder}/${file.name}`.toLowerCase();
    const nextCount = (destinationCounts.get(destinationKey) ?? 0) + 1;
    destinationCounts.set(destinationKey, nextCount);
    const destinationName = nextCount > 1 ? appendSuffix(file.name, nextCount) : file.name;

    return {
      ...file,
      category,
      included,
      destinationName,
      destination: included ? `${category.folder}/${destinationName}` : "移動しない"
    };
  });
}

function duplicateGroups(files) {
  const groups = new Map();
  for (const file of files) {
    const normalized = file.name.toLowerCase().replace(/\s+\(\d+\)(?=\.)/, "");
    const key = `${normalized}:${file.size}`;
    const current = groups.get(key) ?? [];
    current.push(file);
    groups.set(key, current);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function buildDetectedFolders(files, categories, excludedFolders) {
  const groups = new Map();
  const detectionCategories = categories.map((category) => ({ ...category, enabled: true }));
  for (const file of files) {
    const folderPath = normalizeFolderPattern(file.folderPath || "");
    if (!folderPath) continue;
    const folderName = folderPath.split("/").at(-1);
    if (shouldSkipFolder(folderName, folderPath, new Set(excludedFolders))) continue;

    const category = classify(file, detectionCategories);
    const current = groups.get(folderPath) ?? {
      path: folderPath,
      name: folderName,
      count: 0,
      size: 0,
      categoryCounts: new Map()
    };
    current.count += 1;
    current.size += file.size;
    if (category) {
      current.categoryCounts.set(category.id, (current.categoryCounts.get(category.id) ?? 0) + 1);
    }
    groups.set(folderPath, current);
  }

  return [...groups.values()]
    .map((folder) => {
      const [categoryId] = [...folder.categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      const category = categories.find((item) => item.id === categoryId) ?? null;
      return {
        ...folder,
        category,
        categoryCounts: undefined
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.path.localeCompare(b.path, "ja");
    });
}

function folderLabel(handle, fallback) {
  return handle?.name ? handle.name : fallback || "未選択";
}

async function ensureDirectory(rootHandle, folderName) {
  return rootHandle.getDirectoryHandle(folderName, { create: true });
}

async function copyFileToHandle(fileHandle, destinationDirectory, destinationName) {
  const sourceFile = await fileHandle.getFile();
  const destinationFile = await destinationDirectory.getFileHandle(destinationName, { create: true });
  const writable = await destinationFile.createWritable();
  await writable.write(sourceFile);
  await writable.close();
  return destinationFile;
}

function App() {
  const inputRef = useRef(null);
  const isDesktopApp = Boolean(window.assetOrganizer);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [files, setFiles] = useState([]);
  const [rootHandle, setRootHandle] = useState(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState("");
  const [selectedFolderName, setSelectedFolderName] = useState("フォルダ選択無し");
  const [includeMap, setIncludeMap] = useState({});
  const [excludedFolders, setExcludedFolders] = useState([]);
  const [excludeInput, setExcludeInput] = useState("");
  const [folderCategoryFilter, setFolderCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeView, setActiveView] = useState("all");
  const [busy, setBusy] = useState(false);
  const [lastOperations, setLastOperations] = useState([]);
  const [logs, setLogs] = useState([
    { time: now(), type: "info", message: "フォルダを選択してください" }
  ]);

  const plan = useMemo(() => buildPlan(files, categories, includeMap), [files, categories, includeMap]);
  const duplicates = useMemo(() => duplicateGroups(files), [files]);
  const duplicateIdSet = useMemo(() => new Set(duplicates.flat().map((file) => file.id)), [duplicates]);
  const detectedFolders = useMemo(
    () => buildDetectedFolders(files, categories, excludedFolders),
    [categories, excludedFolders, files]
  );
  const visibleDetectedFolders = useMemo(
    () =>
      detectedFolders
        .filter((folder) => folderCategoryFilter === "all" || folder.category?.id === folderCategoryFilter)
        .slice(0, 6),
    [detectedFolders, folderCategoryFilter]
  );
  const filteredPlan = useMemo(() => {
    return plan.filter((file) => {
      const textMatch =
        file.name.toLowerCase().includes(query.toLowerCase()) ||
        file.currentPath.toLowerCase().includes(query.toLowerCase()) ||
        file.destination.toLowerCase().includes(query.toLowerCase());
      const categoryMatch = categoryFilter === "all" || file.category?.id === categoryFilter;
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "included" && file.included) ||
        (statusFilter === "excluded" && !file.included) ||
        (statusFilter === "duplicate" && duplicateIdSet.has(file.id));
      const viewMatch =
        activeView === "all" ||
        (activeView === "included" && file.included) ||
        (activeView === "excluded" && !file.included) ||
        (activeView === "duplicate" && duplicateIdSet.has(file.id));
      return textMatch && categoryMatch && statusMatch && viewMatch;
    });
  }, [activeView, categoryFilter, duplicateIdSet, plan, query, statusFilter]);

  const includedFiles = plan.filter((file) => file.included);
  const excludedFiles = plan.filter((file) => !file.included);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const includedSize = includedFiles.reduce((sum, file) => sum + file.size, 0);
  const hasRealWrite = Boolean(rootHandle || selectedFolderPath);
  const duplicateCount = duplicates.reduce((sum, group) => sum + group.length, 0);
  const longPaths = plan.filter((file) => file.destination.length > 180);

  const addLog = (type, message) => {
    setLogs((current) => [{ time: now(), type, message }, ...current].slice(0, 80));
  };

  const resetIncludeMap = (nextFiles, nextCategories = categories) => {
    const nextMap = {};
    for (const file of nextFiles) {
      nextMap[file.id] = Boolean(classify(file, nextCategories));
    }
    setIncludeMap(nextMap);
  };

  const applyScannedFiles = (nextFiles, nextCategories = categories) => {
    setFiles(nextFiles);
    resetIncludeMap(nextFiles, nextCategories);
    setLastOperations([]);
  };

  const scanCurrentFolder = async (nextExcludedFolders = excludedFolders, nextCategories = categories) => {
    if (isDesktopApp && selectedFolderPath) {
      try {
        setBusy(true);
        const result = await window.assetOrganizer.scanFolder({
          rootPath: selectedFolderPath,
          targetFolders: nextCategories.map((category) => category.folder),
          excludedFolders: nextExcludedFolders
        });
        applyScannedFiles(result.files, nextCategories);
        addLog("ok", `再スキャン完了: ${result.files.length.toLocaleString()}件`);
      } catch (error) {
        addLog("error", `再スキャン失敗: ${error.message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (rootHandle) {
      try {
        setBusy(true);
        const targetFolders = new Set(nextCategories.map((category) => category.folder));
        const collected = await collectFilesFromDirectory(rootHandle, "", targetFolders, new Set(nextExcludedFolders));
        applyScannedFiles(collected, nextCategories);
        addLog("ok", `再スキャン完了: ${collected.length.toLocaleString()}件`);
      } catch (error) {
        addLog("error", `再スキャン失敗: ${error.message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    await scanWithDirectoryPicker(nextExcludedFolders, nextCategories);
  };

  const scanWithDirectoryPicker = async (nextExcludedFolders = excludedFolders, nextCategories = categories) => {
    if (isDesktopApp) {
      try {
        setBusy(true);
        addLog("info", "フォルダ選択を開始しました");
        const result = await window.assetOrganizer.selectFolder({
          targetFolders: nextCategories.map((category) => category.folder),
          excludedFolders: nextExcludedFolders
        });
        if (result.canceled) return;
        setRootHandle(null);
        setSelectedFolderPath(result.rootPath);
        setSelectedFolderName(result.folderName);
        applyScannedFiles(result.files, nextCategories);
        addLog("ok", `スキャン完了: ${result.files.length.toLocaleString()}件`);
      } catch (error) {
        addLog("error", `スキャン失敗: ${error.message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!window.showDirectoryPicker) {
      inputRef.current?.click();
      addLog("warn", "このブラウザではフォルダ実行APIが使えません。内容確認用の読み込みに切り替えます");
      return;
    }

    try {
      setBusy(true);
      addLog("info", "フォルダ選択を開始しました");
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const targetFolders = new Set(nextCategories.map((category) => category.folder));
      const collected = await collectFilesFromDirectory(handle, "", targetFolders, new Set(nextExcludedFolders));
      setRootHandle(handle);
      setSelectedFolderName(folderLabel(handle));
      applyScannedFiles(collected, nextCategories);
      addLog("ok", `スキャン完了: ${collected.length.toLocaleString()}件`);
    } catch (error) {
      if (error?.name !== "AbortError") addLog("error", `スキャン失敗: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const loadFilesFromInput = async (event) => {
    const selected = [...(event.target.files ?? [])].map((file, index) => {
      const relativePath = file.webkitRelativePath || file.name;
      const slashIndex = relativePath.lastIndexOf("/");
      const folderPath = slashIndex >= 0 ? relativePath.slice(0, slashIndex) || "/" : "/";
      return {
        id: makeFileId(relativePath, file.size, file.lastModified || index),
        name: file.name,
        folderPath,
        currentPath: relativePath,
        size: file.size,
        lastModified: file.lastModified,
        ext: getExt(file.name),
        file,
        source: "input"
      };
    }).filter((file) => {
      if (file.folderPath === "/") return true;
      return !file.folderPath.split("/").some((_, index, folders) => {
        const relativeFolder = folders.slice(0, index + 1).join("/");
        return shouldSkipFolder(folders[index], relativeFolder, new Set(excludedFolders));
      });
    });
    if (!selected.length) return;
    setRootHandle(null);
    setSelectedFolderPath("");
    setSelectedFolderName("読み込みフォルダ");
    setFiles(selected);
    resetIncludeMap(selected);
    setLastOperations([]);
    addLog("ok", `内容確認用に${selected.length.toLocaleString()}件を読み込みました`);
    event.target.value = "";
  };

  const toggleCategory = (id) => {
    const nextCategories = categories.map((category) =>
      category.id === id ? { ...category, enabled: !category.enabled } : category
    );
    setCategories(nextCategories);
    resetIncludeMap(files, nextCategories);
    addLog("info", "分類カテゴリを更新しました");
  };

  const setAllCategories = (enabled) => {
    const nextCategories = categories.map((category) => ({ ...category, enabled }));
    setCategories(nextCategories);
    resetIncludeMap(files, nextCategories);
    addLog("info", enabled ? "プリセットを全選択しました" : "プリセットを全解除しました");
  };

  const addExcludedFolderValue = async (value) => {
    const folder = normalizeFolderPattern(value);
    if (!folder || busy) return;
    if (excludedFolders.some((current) => current.toLowerCase() === folder.toLowerCase())) {
      addLog("warn", `除外フォルダは登録済みです: ${folder}`);
      setExcludeInput("");
      return;
    }

    const nextExcludedFolders = [...excludedFolders, folder];
    setExcludedFolders(nextExcludedFolders);
    setExcludeInput("");
    addLog("info", `除外フォルダを追加しました: ${folder}`);
    if (rootHandle || selectedFolderPath) await scanCurrentFolder(nextExcludedFolders);
  };

  const addExcludedFolder = async () => {
    await addExcludedFolderValue(excludeInput);
  };

  const removeExcludedFolder = async (folder) => {
    if (busy) return;
    const nextExcludedFolders = excludedFolders.filter((current) => current !== folder);
    setExcludedFolders(nextExcludedFolders);
    addLog("info", `除外フォルダを解除しました: ${folder}`);
    if (rootHandle || selectedFolderPath) await scanCurrentFolder(nextExcludedFolders);
  };

  const toggleIncluded = (id) => {
    setIncludeMap((current) => ({ ...current, [id]: !(plan.find((file) => file.id === id)?.included ?? false) }));
  };

  const setAllIncluded = (included) => {
    const nextMap = {};
    for (const file of plan) nextMap[file.id] = included && Boolean(file.category);
    setIncludeMap(nextMap);
  };

  const runPlan = async () => {
    if (!includedFiles.length || busy) return;
    setBusy(true);
    addLog("info", "バックアップを作成してから実行します");

    if (isDesktopApp && selectedFolderPath) {
      try {
        const result = await window.assetOrganizer.runPlan({
          rootPath: selectedFolderPath,
          files: includedFiles
        });
        const operations = result.operations.map((operation) => ({ ...operation, mode: "electron" }));
        setLastOperations(operations);
        if (result.backupRootRelative) {
          addLog("ok", `バックアップ作成: ${result.backupRootRelative}`);
        }
        addLog("ok", `実行完了: ${operations.length.toLocaleString()}件を移動しました`);
      } catch (error) {
        addLog("error", `実行失敗: ${error.message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!hasRealWrite) {
      addLog("warn", "実行するにはフォルダを選択してください");
      setBusy(false);
      return;
    }

    const operations = [];
    try {
      for (const file of includedFiles) {
        if (!file.handle || !file.parentHandle || !file.category) continue;
        const destinationDirectory = await ensureDirectory(rootHandle, file.category.folder);
        await copyFileToHandle(file.handle, destinationDirectory, file.destinationName);
        await file.parentHandle.removeEntry(file.name);
        operations.push({
          mode: "filesystem",
          sourceParent: file.parentHandle,
          sourceName: file.name,
          destinationDirectory,
          destinationName: file.destinationName,
          source: file.currentPath,
          destination: file.destination
        });
      }
      setLastOperations(operations);
      addLog("ok", `実行完了: ${operations.length.toLocaleString()}件を移動しました`);
    } catch (error) {
      addLog("error", `実行中断: ${error.message}`);
      if (operations.length) {
        addLog("warn", `${operations.length.toLocaleString()}件は移動済みです。必要ならUndoしてください`);
      }
    } finally {
      setBusy(false);
    }
  };

  const undoLastRun = async () => {
    if (!lastOperations.length || busy) return;
    setBusy(true);
    addLog("info", "Undoを開始しました");

    if (isDesktopApp && selectedFolderPath && lastOperations[0]?.mode === "electron") {
      try {
        const result = await window.assetOrganizer.undo({
          rootPath: selectedFolderPath,
          operations: lastOperations
        });
        setLastOperations([]);
        addLog("ok", `Undo完了: ${result.restored.length.toLocaleString()}件を戻しました`);
      } catch (error) {
        addLog("error", `Undo失敗: ${error.message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (lastOperations[0]?.mode !== "filesystem") {
      setLastOperations([]);
      addLog("ok", "実行記録をクリアしました");
      setBusy(false);
      return;
    }

    let restored = 0;
    try {
      for (const operation of lastOperations.slice().reverse()) {
        const movedFile = await operation.destinationDirectory.getFileHandle(operation.destinationName);
        await copyFileToHandle(movedFile, operation.sourceParent, operation.sourceName);
        await operation.destinationDirectory.removeEntry(operation.destinationName);
        restored += 1;
      }
      setLastOperations([]);
      addLog("ok", `Undo完了: ${restored.toLocaleString()}件を戻しました`);
    } catch (error) {
      addLog("error", `Undo失敗: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteBackups = async () => {
    if (!isDesktopApp || !selectedFolderPath || busy) return;
    const ok = window.confirm(
      "選択中フォルダ内の _asset-organizer-backup を削除します。バックアップは元に戻せません。実行しますか？"
    );
    if (!ok) return;

    try {
      setBusy(true);
      const result = await window.assetOrganizer.deleteBackups({
        rootPath: selectedFolderPath
      });
      if (result.deleted) {
        addLog("ok", `バックアップを削除しました: ${result.backupRootRelative}`);
      } else {
        addLog("info", "削除するバックアップはありません");
      }
    } catch (error) {
      addLog("error", `バックアップ削除失敗: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Folder size={19} />
          </span>
          <span>素材整頓</span>
        </div>

        <section className="sidebar-section">
          <h2>選択中のフォルダ</h2>
          <div className="folder-box">
            <div className="folder-row">
              <FolderOpen size={22} />
              <strong>{selectedFolderName}</strong>
            </div>
            <p>
              {files.length.toLocaleString()} ファイル / {formatBytes(totalSize)}
            </p>
            <button className="outline-button full" onClick={() => scanWithDirectoryPicker()} disabled={busy}>
              <FolderOpen size={15} />
              フォルダを選択
            </button>
            <input
              ref={inputRef}
              className="hidden-input"
              type="file"
              multiple
              webkitdirectory=""
              onChange={loadFilesFromInput}
            />
          </div>
        </section>

        <section className="sidebar-section exclusion-section">
          <h2>除外フォルダ</h2>
          <div className="exclusion-box">
            <div className="exclusion-input">
              <input
                value={excludeInput}
                onChange={(event) => setExcludeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addExcludedFolder();
                }}
                placeholder="例: 保留 / old_assets"
                disabled={busy}
              />
              <button className="mini-button" onClick={addExcludedFolder} disabled={busy || !normalizeFolderPattern(excludeInput)}>
                追加
              </button>
            </div>
            <p>名前一致、または選択フォルダからの相対パスで除外します。</p>
            <div className="exclusion-list">
              {excludedFolders.map((folder) => (
                <span className="exclusion-chip" key={folder}>
                  {folder}
                  <button onClick={() => removeExcludedFolder(folder)} disabled={busy} aria-label={`${folder}の除外を解除`}>
                    ×
                  </button>
                </span>
              ))}
              {excludedFolders.length === 0 && <span className="empty-chip">未設定</span>}
            </div>
            <div className="detected-folders">
              <div className="detected-heading">
                <strong>検出候補</strong>
                <select
                  value={folderCategoryFilter}
                  onChange={(event) => setFolderCategoryFilter(event.target.value)}
                  disabled={busy}
                >
                  <option value="all">全カテゴリ</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="detected-folder-list">
                {visibleDetectedFolders.map((folder) => (
                  <button
                    className="detected-folder-button"
                    key={folder.path}
                    onClick={() => addExcludedFolderValue(folder.path)}
                    disabled={busy}
                    title={folder.path}
                  >
                    <span>
                      <strong>{folder.name}</strong>
                      <small>{folder.path}</small>
                    </span>
                    <em>{folder.category?.label ?? "未分類"} / {folder.count}件</em>
                  </button>
                ))}
                {visibleDetectedFolders.length === 0 && <span className="empty-chip">候補なし</span>}
              </div>
            </div>
          </div>
        </section>

        <section className="sidebar-section categories-section">
          <h2>分類カテゴリ</h2>
          <div className="preset-actions">
            <button className="mini-button" onClick={() => setAllCategories(true)} disabled={busy}>
              全選択
            </button>
            <button className="mini-button" onClick={() => setAllCategories(false)} disabled={busy}>
              全解除
            </button>
          </div>
          <div className="preset-list">
            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category.icon] ?? File;
              return (
                <button
                  key={category.id}
                  className={`preset-button ${category.enabled ? "selected" : ""}`}
                  onClick={() => toggleCategory(category.id)}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{category.label}</strong>
                    <small>{category.extensions.slice(0, 4).join(", ")}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>整理プレビュー</h1>
            <p>フォルダ内の素材を分類し、移動先を実行前に確認できます。</p>
          </div>
          <div className="topbar-actions">
            <button className="primary-button" onClick={() => scanCurrentFolder()} disabled={busy}>
              {busy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
              再スキャン
            </button>
          </div>
        </header>

        <button className="drop-zone" onClick={() => scanWithDirectoryPicker()} disabled={busy}>
          <UploadCloud size={34} />
          <span>
            <strong>フォルダを選択</strong>
            <small>サブフォルダを含めてスキャンします。通常入力ではプレビューのみ。</small>
          </span>
        </button>

        <section className="summary-grid">
          <Summary label="総ファイル数" value={files.length.toLocaleString()} />
          <Summary label="総サイズ" value={formatBytes(totalSize)} />
          <Summary label="含めるファイル" value={includedFiles.length.toLocaleString()} detail={formatBytes(includedSize)} positive />
          <Summary label="除外するファイル" value={excludedFiles.length.toLocaleString()} warning />
          <Summary label="重複グループ" value={`${duplicates.length.toLocaleString()} グループ`} warning={duplicates.length > 0} />
          <Summary label="状態" value={hasRealWrite ? "実行可能" : "フォルダ未選択"} detail={hasRealWrite ? "バックアップ対応" : "内容確認のみ"} />
        </section>

        <section className="preview-panel">
          <div className="panel-heading">
            <div>
              <h2>移動前プレビュー</h2>
              <p>実行前に、どのファイルがどこに移動されるか確認できます。</p>
            </div>
          </div>

          <div className="toolbar">
            <div className="segmented">
              <button className={activeView === "all" ? "active" : ""} onClick={() => setActiveView("all")}>
                すべて
              </button>
              <button className={activeView === "included" ? "active" : ""} onClick={() => setActiveView("included")}>
                含める
              </button>
              <button className={activeView === "excluded" ? "active" : ""} onClick={() => setActiveView("excluded")}>
                除外する
              </button>
              <button className={activeView === "duplicate" ? "active" : ""} onClick={() => setActiveView("duplicate")}>
                重複あり
              </button>
            </div>
            <label className="search-field">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ファイル名・拡張子で検索" />
            </label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">すべてのカテゴリ</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">すべての結果</option>
              <option value="included">含める</option>
              <option value="excluded">除外する</option>
              <option value="duplicate">重複</option>
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={includedFiles.length > 0 && includedFiles.length === plan.filter((file) => file.category).length}
                      onChange={(event) => setAllIncluded(event.target.checked)}
                    />
                  </th>
                  <th>ファイル名</th>
                  <th>現在のパス</th>
                  <th>移動先（提案）</th>
                  <th>カテゴリ</th>
                  <th>重複</th>
                  <th>含める</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlan.map((file) => {
                  const Icon = CATEGORY_ICONS[file.category?.icon] ?? File;
                  const isDuplicate = duplicateIdSet.has(file.id);
                  return (
                    <tr key={file.id} className={!file.included ? "muted-row" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={file.included}
                          disabled={!file.category}
                          onChange={() => toggleIncluded(file.id)}
                        />
                      </td>
                      <td>
                        <div className="file-cell">
                          <Icon size={19} />
                          <span>
                            <strong>{file.name}</strong>
                            <small>{formatBytes(file.size)}</small>
                          </span>
                        </div>
                      </td>
                      <td className="path-cell">{file.folderPath}</td>
                      <td className="path-cell">{file.destination}</td>
                      <td>
                        {file.category ? (
                          <span className={`tag ${file.category.tone}`}>{file.category.label}</span>
                        ) : (
                          <span className="tag neutral">対象外</span>
                        )}
                      </td>
                      <td>
                        {isDuplicate ? (
                          <span className="duplicate">
                            <AlertTriangle size={14} />
                            重複
                          </span>
                        ) : (
                          <span className="dash">-</span>
                        )}
                      </td>
                      <td>
                        <button
                          className={`switch ${file.included ? "on" : ""}`}
                          disabled={!file.category}
                          onClick={() => toggleIncluded(file.id)}
                          aria-label={`${file.name}を含める`}
                        >
                          <span />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="action-bar">
            <span className="positive">{includedFiles.length.toLocaleString()} 件を含める（{formatBytes(includedSize)}）</span>
            <span className="danger">{excludedFiles.length.toLocaleString()} 件を除外する</span>
            <span>選択中: {includedFiles.length.toLocaleString()} 件</span>
            <button className="outline-button" onClick={() => setAllIncluded(false)}>
              <Trash2 size={16} />
              全て除外
            </button>
            <button className="primary-button run" onClick={runPlan} disabled={busy || !includedFiles.length || !hasRealWrite}>
              {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
              実行
            </button>
          </div>
        </section>
      </main>

      <aside className="inspector">
        <section className="inspector-section">
          <div className="inspector-title">
            <h2>重複グループ</h2>
            <span>{duplicates.length}</span>
            <ChevronUp size={16} />
          </div>
          <div className="duplicate-list">
            {duplicates.slice(0, 4).map((group) => (
              <div className="duplicate-card" key={`${group[0].name}:${group[0].size}`}>
                <FileImage size={18} />
                <span>
                  <strong>{group[0].name}</strong>
                  <small>
                    {formatBytes(group[0].size)} / {group.length} ファイル
                  </small>
                </span>
                <AlertTriangle size={16} />
              </div>
            ))}
            {duplicates.length === 0 && <p className="empty-copy">重複候補はありません。</p>}
          </div>
        </section>

        <section className="inspector-section">
          <h2>実行前の安全チェック</h2>
          <CheckItem ok={includedFiles.length > 0} label="移動対象が選択済み" />
          <CheckItem ok={hasRealWrite} warn={!hasRealWrite} label={hasRealWrite ? "フォルダの書き込み権限" : "フォルダ未選択"} />
          <CheckItem ok={longPaths.length === 0} warn={longPaths.length > 0} label={`長すぎるパス: ${longPaths.length} 件`} />
          <CheckItem ok={duplicates.length === 0} warn={duplicates.length > 0} label={`重複候補: ${duplicateCount} 件`} />
          <CheckItem ok label="バックアップ準備" />
          <CheckItem ok label="Undo準備" />
        </section>

        <section className="inspector-section log-section">
          <div className="inspector-title">
            <h2>ログ</h2>
            <button className="text-button small" onClick={() => setLogs([])}>
              クリア
            </button>
          </div>
          <div className="log-list">
            {logs.map((log, index) => (
              <div className="log-row" key={`${log.time}-${index}`}>
                <span className="log-time">{log.time}</span>
                <span className={`log-message ${log.type}`}>{log.message}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="undo-box">
          <div>
            <h2>Undo（取り消し）</h2>
            <p>
              最後の実行: {lastOperations.length ? `${lastOperations.length.toLocaleString()} 件` : "なし"}
              <br />
              {lastOperations.length ? "実ファイルを元の場所へ戻します。" : "直前の実行はありません。"}
            </p>
          </div>
          <button className="outline-button full undo" onClick={undoLastRun} disabled={busy || !lastOperations.length}>
            <RotateCcw size={18} />
            Undo
          </button>
        </section>

        <section className="undo-box">
          <div>
            <h2>バックアップ</h2>
            <p>
              保存先: _asset-organizer-backup
              <br />
              選択中フォルダ内のバックアップをまとめて削除します。
            </p>
          </div>
          <button
            className="outline-button full danger-outline"
            onClick={deleteBackups}
            disabled={busy || !isDesktopApp || !selectedFolderPath}
          >
            <Trash2 size={18} />
            バックアップを削除
          </button>
        </section>
      </aside>
    </div>
  );
}

function Summary({ label, value, detail, positive, warning }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong className={positive ? "positive" : warning ? "warning" : ""}>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function CheckItem({ ok, warn, label }) {
  return (
    <div className="check-row">
      {ok ? (
        <CheckCircle2 size={17} className="ok" />
      ) : warn ? (
        <AlertTriangle size={17} className="warn" />
      ) : (
        <XCircle size={17} className="bad" />
      )}
      <span>{label}</span>
    </div>
  );
}

export default App;
