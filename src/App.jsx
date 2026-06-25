import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronUp,
  Circle,
  CircleCheck,
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
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sun,
  Trash2,
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

const DEFAULT_COLUMN_WIDTHS = {
  select: 44,
  name: 220,
  currentPath: 260,
  destination: 300,
  category: 112,
  duplicate: 78,
  include: 78
};

const COLUMN_MIN_WIDTHS = {
  select: 44,
  name: 150,
  currentPath: 180,
  destination: 200,
  category: 96,
  duplicate: 70,
  include: 70
};

const BACKUP_FOLDER_NAMES = new Set(["_file-organizer-backup", "_asset-organizer-backup"]);

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
const isSafeRelativeFolder = (value) => {
  const normalized = normalizeFolderPattern(value);
  if (!normalized) return false;
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith("/")) return false;
  return normalized.split("/").every((part) => part && part !== "." && part !== "..");
};

function classify(file, categories) {
  const ext = getExt(file.name);
  return categories.find((category) => category.enabled && category.extensions.includes(ext)) ?? null;
}

async function collectFilesFromDirectory(directoryHandle) {
  const entries = [];
  for await (const [name, entry] of directoryHandle.entries()) {
    if (entry.kind === "directory") {
      continue;
    }
    const file = await entry.getFile();
    entries.push({
      id: makeFileId(name, file.size, file.lastModified),
      name,
      folderPath: "/",
      currentPath: name,
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

function folderLabel(handle, fallback) {
  return handle?.name ? handle.name : fallback || "未選択";
}

async function ensureDirectory(rootHandle, folderName) {
  let current = rootHandle;
  for (const part of normalizeFolderPattern(folderName).split("/")) {
    if (!part) continue;
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
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
  const [outputRootHandle, setOutputRootHandle] = useState(null);
  const [outputFolderPath, setOutputFolderPath] = useState("");
  const [outputFolderName, setOutputFolderName] = useState("選択中フォルダを使用");
  const [includeMap, setIncludeMap] = useState({});
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeView, setActiveView] = useState("all");
  const [busy, setBusy] = useState(false);
  const [lastOperations, setLastOperations] = useState([]);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [inspectorOpen, setInspectorOpen] = useState({
    rules: false,
    duplicates: true,
    safety: true,
    logs: true,
    undo: true,
    backup: true
  });
  const [viewMode, setViewMode] = useState("simple");
  const [theme, setTheme] = useState(() => window.localStorage?.getItem("fileOrganizerTheme") || "dark");
  const [logs, setLogs] = useState([
    { time: now(), type: "info", message: "フォルダを選択してください" }
  ]);

  const plan = useMemo(() => buildPlan(files, categories, includeMap), [files, categories, includeMap]);
  const duplicates = useMemo(() => duplicateGroups(files), [files]);
  const duplicateIdSet = useMemo(() => new Set(duplicates.flat().map((file) => file.id)), [duplicates]);
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
  const hasCustomOutputRoot = Boolean(outputFolderPath || outputRootHandle);
  const outputDestinationName = hasCustomOutputRoot
    ? outputFolderName
    : hasRealWrite
      ? selectedFolderName
      : "選択中フォルダ未選択";
  const outputDestinationDetail = hasCustomOutputRoot
    ? outputFolderPath || "ブラウザで選択した出力先"
    : selectedFolderPath || (rootHandle ? "ブラウザで選択中のフォルダ" : "フォルダ未選択");
  const outputRootSummary = hasCustomOutputRoot ? "指定済み" : hasRealWrite ? "選択中フォルダ" : "未選択";
  const duplicateCount = duplicates.reduce((sum, group) => sum + group.length, 0);
  const longPaths = plan.filter((file) => file.destination.length > 180);
  const invalidCategoryFolders = categories.filter((category) => category.enabled && !isSafeRelativeFolder(category.folder));
  const hasInvalidCategoryFolder = invalidCategoryFolders.length > 0;
  const canRun = Boolean(includedFiles.length && hasRealWrite && !hasInvalidCategoryFolder);
  const runDisabledReason = !hasRealWrite
    ? "整理を実行するには、整理するフォルダを選択してください。"
    : !includedFiles.length
      ? "整理対象のファイルがありません。"
      : hasInvalidCategoryFolder
        ? "移動先フォルダ名を確認してください。"
        : "整理内容を確認して実行できます。";
  const previewColumns = [
    { key: "select", label: "", width: columnWidths.select },
    { key: "name", label: "ファイル名", width: columnWidths.name, resizable: true },
    { key: "currentPath", label: "現在のパス", width: columnWidths.currentPath, resizable: true },
    { key: "destination", label: "移動先（提案）", width: columnWidths.destination, resizable: true },
    { key: "category", label: "カテゴリ", width: columnWidths.category },
    { key: "duplicate", label: "重複", width: columnWidths.duplicate },
    { key: "include", label: "含める", width: columnWidths.include }
  ];
  const previewTableWidth = previewColumns.reduce((sum, column) => sum + column.width, 0);

  const addLog = (type, message) => {
    setLogs((current) => [{ time: now(), type, message }, ...current].slice(0, 80));
  };

  const toggleInspectorSection = (key) => {
    setInspectorOpen((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleTheme = () => {
    setTheme((current) => {
      const nextTheme = current === "dark" ? "light" : "dark";
      window.localStorage?.setItem("fileOrganizerTheme", nextTheme);
      return nextTheme;
    });
  };

  const startColumnResize = (key, event) => {
    if (!COLUMN_MIN_WIDTHS[key]) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[key];
    document.body.classList.add("resizing-column");

    const onPointerMove = (moveEvent) => {
      const nextWidth = Math.max(COLUMN_MIN_WIDTHS[key], startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [key]: nextWidth }));
    };

    const stopResize = () => {
      document.body.classList.remove("resizing-column");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
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

  const scanCurrentFolder = async (nextCategories = categories) => {
    if (isDesktopApp && selectedFolderPath) {
      try {
        setBusy(true);
        const result = await window.assetOrganizer.scanFolder({
          rootPath: selectedFolderPath
        });
        applyScannedFiles(result.files, nextCategories);
        addLog("ok", `再スキャン完了: 直下ファイル ${result.files.length.toLocaleString()}件`);
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
        const collected = await collectFilesFromDirectory(rootHandle);
        applyScannedFiles(collected, nextCategories);
        addLog("ok", `再スキャン完了: 直下ファイル ${collected.length.toLocaleString()}件`);
      } catch (error) {
        addLog("error", `再スキャン失敗: ${error.message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    await scanWithDirectoryPicker(nextCategories);
  };

  const scanWithDirectoryPicker = async (nextCategories = categories) => {
    if (isDesktopApp) {
      try {
        setBusy(true);
        addLog("info", "フォルダ選択を開始しました");
        const result = await window.assetOrganizer.selectFolder();
        if (result.canceled) return;
        setRootHandle(null);
        setSelectedFolderPath(result.rootPath);
        setSelectedFolderName(result.folderName);
        applyScannedFiles(result.files, nextCategories);
        addLog("ok", `スキャン完了: 直下ファイル ${result.files.length.toLocaleString()}件`);
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
      const collected = await collectFilesFromDirectory(handle);
      setRootHandle(handle);
      setSelectedFolderName(folderLabel(handle));
      applyScannedFiles(collected, nextCategories);
      addLog("ok", `スキャン完了: 直下ファイル ${collected.length.toLocaleString()}件`);
    } catch (error) {
      if (error?.name !== "AbortError") addLog("error", `スキャン失敗: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const loadFilesFromInput = async (event) => {
    const selected = [...(event.target.files ?? [])].flatMap((file, index) => {
      const relativePath = file.webkitRelativePath || file.name;
      const parts = relativePath.split("/").filter(Boolean);
      if (parts.length > 2) return [];
      return {
        id: makeFileId(file.name, file.size, file.lastModified || index),
        name: file.name,
        folderPath: "/",
        currentPath: file.name,
        size: file.size,
        lastModified: file.lastModified,
        ext: getExt(file.name),
        file,
        source: "input"
      };
    });
    if (!selected.length) return;
    setRootHandle(null);
    setSelectedFolderPath("");
    setSelectedFolderName("読み込みフォルダ");
    setFiles(selected);
    resetIncludeMap(selected);
    setLastOperations([]);
    addLog("ok", `内容確認用に直下ファイル ${selected.length.toLocaleString()}件を読み込みました`);
    event.target.value = "";
  };

  const selectOutputFolder = async () => {
    if (busy) return;

    if (isDesktopApp) {
      try {
        setBusy(true);
        addLog("info", "出力先フォルダ選択を開始しました");
        const result = await window.assetOrganizer.selectOutputFolder();
        if (result.canceled) return;
        setOutputRootHandle(null);
        setOutputFolderPath(result.outputPath);
        setOutputFolderName(result.folderName);
        addLog("ok", `出力先フォルダを設定しました: ${result.folderName}`);
      } catch (error) {
        addLog("error", `出力先フォルダ選択失敗: ${error.message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!window.showDirectoryPicker) {
      addLog("warn", "このブラウザでは出力先フォルダを選択できません");
      return;
    }

    try {
      setBusy(true);
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      setOutputRootHandle(handle);
      setOutputFolderPath("");
      setOutputFolderName(folderLabel(handle));
      addLog("ok", `出力先フォルダを設定しました: ${folderLabel(handle)}`);
    } catch (error) {
      if (error?.name !== "AbortError") addLog("error", `出力先フォルダ選択失敗: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const resetOutputFolder = () => {
    setOutputRootHandle(null);
    setOutputFolderPath("");
    setOutputFolderName("選択中フォルダを使用");
    addLog("info", "出力先フォルダを選択中フォルダに戻しました");
  };

  const updateCategoryFolder = (id, folder) => {
    const nextCategories = categories.map((category) =>
      category.id === id ? { ...category, folder } : category
    );
    setCategories(nextCategories);
    resetIncludeMap(files, nextCategories);
  };

  const normalizeCategoryFolder = (id) => {
    const nextCategories = categories.map((category) =>
      category.id === id ? { ...category, folder: normalizeFolderPattern(category.folder) } : category
    );
    setCategories(nextCategories);
    resetIncludeMap(files, nextCategories);
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
    if (hasInvalidCategoryFolder) {
      addLog("warn", `移動先フォルダ名を確認してください: ${invalidCategoryFolders.map((category) => category.label).join(", ")}`);
      return;
    }
    setBusy(true);
    addLog("info", "バックアップを作成してから実行します");

    if (isDesktopApp && selectedFolderPath) {
      try {
        const result = await window.assetOrganizer.runPlan({
          sourceRootPath: selectedFolderPath,
          outputRootPath: outputFolderPath || selectedFolderPath,
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
      const destinationRootHandle = outputRootHandle || rootHandle;
      for (const file of includedFiles) {
        if (!file.handle || !file.parentHandle || !file.category) continue;
        const destinationDirectory = await ensureDirectory(destinationRootHandle, file.category.folder);
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
      "選択中フォルダ内の _file-organizer-backup を削除します。バックアップは元に戻せません。実行しますか？"
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
    <div className={`app-shell theme-${theme}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-title">
            <span className="brand-mark">
              <Folder size={19} />
            </span>
            <span>FileOrganizer</span>
          </span>
        </div>
        <div className="header-actions">
          <span className="mode-label">表示モード</span>
          <div className="mode-switch" aria-label="表示モード">
            <button className={viewMode === "simple" ? "active" : ""} type="button" onClick={() => setViewMode("simple")}>
              シンプル
            </button>
            <button className={viewMode === "detail" ? "active" : ""} type="button" onClick={() => setViewMode("detail")}>
              詳細
            </button>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
            title={theme === "dark" ? "ライトモード" : "ダークモード"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="ghost-action" type="button" onClick={() => setInspectorOpen((current) => ({ ...current, rules: !current.rules }))}>
            <Settings size={16} />
            設定
          </button>
          <button className="ghost-action" type="button" onClick={() => addLog("info", "ヘルプ: 1. フォルダ選択 2. 保存先確認 3. 整理を実行")}>
            <Circle size={16} />
            ヘルプ
          </button>
        </div>
      </header>

      <main className="main-stage">
        <section className="workflow-card">
          <div className="stepper">
            <div className={`step-item ${hasRealWrite ? "done" : "active"}`}>
              <span>{hasRealWrite ? <CheckCircle2 size={18} /> : "1"}</span>
              <div>
                <strong>フォルダを選択</strong>
                <small>整理するフォルダを選びます</small>
              </div>
            </div>
            <ChevronUp className="step-arrow" size={18} />
            <div className={`step-item ${hasCustomOutputRoot || hasRealWrite ? "done" : ""}`}>
              <span>2</span>
              <div>
                <strong>出力先を選択</strong>
                <small>保存先を確認します</small>
              </div>
            </div>
            <ChevronUp className="step-arrow" size={18} />
            <div className={`step-item ${canRun ? "active" : ""}`}>
              <span>3</span>
              <div>
                <strong>内容を確認して実行</strong>
                <small>プレビュー後に整理します</small>
              </div>
            </div>
          </div>

          <div className="workflow-body">
            <div className="workflow-main">
              <div className="selection-grid">
                <section className="selection-card">
                  <div>
                    <h2>整理するフォルダ</h2>
                    <p>選択フォルダ直下のファイルだけを整理します。</p>
                  </div>
                  <div className="selected-folder-line">
                    <span className="large-icon"><FolderOpen size={28} /></span>
                    <div>
                      <strong>{hasRealWrite ? selectedFolderName : "未選択"}</strong>
                      <small>{hasRealWrite ? `${files.length.toLocaleString()} ファイル / ${formatBytes(totalSize)}` : "フォルダを選択してください"}</small>
                    </div>
                    <button className="outline-button" onClick={() => scanWithDirectoryPicker()} disabled={busy}>
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

                <section className="selection-card">
                  <div>
                    <h2>保存先（出力先）</h2>
                    <p>未指定時は整理するフォルダを保存先にします。</p>
                  </div>
                  <div className="selected-folder-line">
                    <span className="large-icon"><Folder size={28} /></span>
                    <div>
                      <strong>{hasCustomOutputRoot ? outputDestinationName : hasRealWrite ? "整理するフォルダ内" : "未選択"}</strong>
                      <small>{outputDestinationDetail}</small>
                    </div>
                    <button className="outline-button" onClick={selectOutputFolder} disabled={busy}>
                      <FolderOpen size={15} />
                      出力先を選択
                    </button>
                  </div>
                  {(outputFolderPath || outputRootHandle) && (
                    <button className="text-button compact" onClick={resetOutputFolder} disabled={busy}>
                      選択中フォルダに戻す
                    </button>
                  )}
                </section>
              </div>

              <div className="metric-grid">
                <Metric icon={<FileText size={22} />} label="総ファイル数" value={files.length.toLocaleString()} detail="ファイル" tone="blue" />
                <Metric icon={<CircleCheck size={22} />} label="整理対象" value={includedFiles.length.toLocaleString()} detail="ファイル" tone="green" />
                <Metric icon={<XCircle size={22} />} label="除外" value={excludedFiles.length.toLocaleString()} detail="ファイル" tone="orange" />
                <Metric icon={<FileCode2 size={22} />} label="重複ファイル" value={duplicateCount.toLocaleString()} detail="ファイル" tone="purple" />
              </div>
            </div>

            <aside className="action-panel">
              <button className="primary-button execute-button" onClick={runPlan} disabled={busy || !canRun}>
                {busy ? <Loader2 className="spin" size={20} /> : <Play size={20} />}
                整理を実行
              </button>
              <p>{runDisabledReason}</p>
              <button className="outline-button full" onClick={() => scanCurrentFolder()} disabled={busy}>
                <RefreshCw size={17} />
                再スキャン
              </button>

              <section className="check-panel">
                <div className="panel-title-row">
                  <strong>実行前チェック</strong>
                  <span>{canRun ? "OK" : "未チェック"}</span>
                </div>
                <CheckItem ok={includedFiles.length > 0} label="整理対象が選択済み" />
                <CheckItem ok={hasRealWrite} warn={!hasRealWrite} label={hasRealWrite ? "整理するフォルダOK" : "フォルダ未選択"} />
                <CheckItem ok={!hasInvalidCategoryFolder} warn={hasInvalidCategoryFolder} label={hasInvalidCategoryFolder ? `移動先フォルダ名: ${invalidCategoryFolders.length}件` : "移動先フォルダ名OK"} />
                <CheckItem ok label="バックアップ準備" />
                <CheckItem ok label="Undo準備" />
              </section>
            </aside>
          </div>

          <section className="preview-panel">
            <div className="panel-heading">
              <div>
                <h2>整理プレビュー</h2>
                <p>実行前に、どのファイルがどこに移動されるか確認できます。</p>
              </div>
            </div>

            <div className="toolbar">
              <div className="segmented">
                <button className={activeView === "all" ? "active" : ""} onClick={() => setActiveView("all")}>
                  すべて
                </button>
                <button className={activeView === "included" ? "active" : ""} onClick={() => setActiveView("included")}>
                  整理対象
                </button>
                <button className={activeView === "excluded" ? "active" : ""} onClick={() => setActiveView("excluded")}>
                  除外
                </button>
                <button className={activeView === "duplicate" ? "active" : ""} onClick={() => setActiveView("duplicate")}>
                  重複
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
                <option value="included">整理対象</option>
                <option value="excluded">除外</option>
                <option value="duplicate">重複</option>
              </select>
            </div>

            <div className="table-wrap">
              <table style={{ width: `max(100%, ${previewTableWidth}px)` }}>
                <colgroup>
                  {previewColumns.map((column) => (
                    <col key={column.key} style={{ width: `${column.width}px` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {previewColumns.map((column) => (
                      <th key={column.key} className={column.resizable ? "resizable-column" : ""}>
                        {column.key === "select" ? (
                          <input
                            type="checkbox"
                            checked={includedFiles.length > 0 && includedFiles.length === plan.filter((file) => file.category).length}
                            onChange={(event) => setAllIncluded(event.target.checked)}
                          />
                        ) : (
                          <span>{column.label}</span>
                        )}
                        {column.resizable && (
                          <button
                            className="column-resizer"
                            type="button"
                            onPointerDown={(event) => startColumnResize(column.key, event)}
                            aria-label={`${column.label}の列幅を変更`}
                          />
                        )}
                      </th>
                    ))}
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
                            aria-label={`${file.name}を整理する`}
                          >
                            <span />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredPlan.length === 0 && (
                <div className="empty-preview">
                  <FolderOpen size={34} />
                  <strong>フォルダを選択してスキャンしてください</strong>
                  <span>整理するフォルダを選択すると、ここにプレビューが表示されます。</span>
                </div>
              )}
            </div>

            <div className="action-bar">
              <span>{filteredPlan.length.toLocaleString()} 件中 {includedFiles.length.toLocaleString()} 件を表示</span>
              <span className="positive">整理対象: {includedFiles.length.toLocaleString()} 件</span>
              <span className="danger">除外: {excludedFiles.length.toLocaleString()} 件</span>
              <button className="outline-button" onClick={() => setAllIncluded(false)}>
                <Trash2 size={16} />
                全て除外
              </button>
            </div>
          </section>
        </section>

        <section className={`detail-drawer ${viewMode === "detail" ? "always-open" : ""}`}>
          <DetailPanel title="詳細設定" subtitle="分類ルール・移動先フォルダ名を調整します" icon={<Settings size={18} />} open={viewMode === "detail" || inspectorOpen.rules} onToggle={() => toggleInspectorSection("rules")}>
            <div className="rule-actions">
              <button className="mini-button" onClick={() => setAllCategories(true)} disabled={busy}>全選択</button>
              <button className="mini-button" onClick={() => setAllCategories(false)} disabled={busy}>全解除</button>
            </div>
            <div className="rules-table">
              {categories.map((category) => {
                const Icon = CATEGORY_ICONS[category.icon] ?? File;
                return (
                  <div className="rule-row" key={category.id}>
                    <label>
                      <input type="checkbox" checked={category.enabled} onChange={() => toggleCategory(category.id)} disabled={busy} />
                      <Icon size={17} />
                      <strong>{category.label}</strong>
                    </label>
                    <span>{category.extensions.slice(0, 5).join(", ")}</span>
                    <input
                      value={category.folder}
                      onChange={(event) => updateCategoryFolder(category.id, event.target.value)}
                      onBlur={() => normalizeCategoryFolder(category.id)}
                      aria-invalid={category.enabled && !isSafeRelativeFolder(category.folder)}
                      disabled={busy}
                    />
                  </div>
                );
              })}
            </div>
          </DetailPanel>

          <DetailPanel title="重複グループ" subtitle={`${duplicates.length.toLocaleString()} グループ`} icon={<FileImage size={18} />} open={viewMode === "detail" || inspectorOpen.duplicates} onToggle={() => toggleInspectorSection("duplicates")}>
            <div className="duplicate-list">
              {duplicates.slice(0, 4).map((group) => (
                <div className="duplicate-card" key={`${group[0].name}:${group[0].size}`}>
                  <FileImage size={18} />
                  <span>
                    <strong>{group[0].name}</strong>
                    <small>{formatBytes(group[0].size)} / {group.length} ファイル</small>
                  </span>
                  <AlertTriangle size={16} />
                </div>
              ))}
              {duplicates.length === 0 && <p className="empty-copy">重複候補はありません。</p>}
            </div>
          </DetailPanel>

          <DetailPanel title="ログ" subtitle="実行結果と操作履歴" icon={<FileText size={18} />} open={viewMode === "detail" || inspectorOpen.logs} onToggle={() => toggleInspectorSection("logs")}>
            <button className="text-button small" onClick={() => setLogs([])}>クリア</button>
            <div className="log-list">
              {logs.map((log, index) => (
                <div className="log-row" key={`${log.time}-${index}`}>
                  <span className="log-time">{log.time}</span>
                  <span className={`log-message ${log.type}`}>{log.message}</span>
                </div>
              ))}
            </div>
          </DetailPanel>

          <DetailPanel title="Undo（取り消し）" subtitle={lastOperations.length ? `${lastOperations.length.toLocaleString()} 件を戻せます` : "直前の実行はありません"} icon={<RotateCcw size={18} />} open={viewMode === "detail" || inspectorOpen.undo} onToggle={() => toggleInspectorSection("undo")}>
            <button className="outline-button full undo" onClick={undoLastRun} disabled={busy || !lastOperations.length}>
              <RotateCcw size={18} />
              Undo
            </button>
          </DetailPanel>

          <DetailPanel title="バックアップ" subtitle="選択中フォルダ内のバックアップを管理します" icon={<Archive size={18} />} open={viewMode === "detail" || inspectorOpen.backup} onToggle={() => toggleInspectorSection("backup")}>
            <p className="detail-copy">保存先: _file-organizer-backup</p>
            <button
              className="outline-button full danger-outline"
              onClick={deleteBackups}
              disabled={busy || !isDesktopApp || !selectedFolderPath}
            >
              <Trash2 size={18} />
              バックアップを削除
            </button>
          </DetailPanel>
        </section>
      </main>
    </div>
  );
}

function Metric({ icon, label, value, detail, tone }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span className="metric-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}

function DetailPanel({ title, subtitle, icon, open, onToggle, children }) {
  return (
    <section className={`detail-panel ${open ? "open" : "collapsed"}`}>
      <button className="detail-trigger" type="button" onClick={onToggle}>
        <span className="detail-icon">{icon}</span>
        <span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <ChevronUp size={17} />
      </button>
      {open && <div className="detail-content">{children}</div>}
    </section>
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
