const els = {
  fileInput: document.querySelector("#fileInput"),
  folderInput: document.querySelector("#folderInput"),
  folderBtn: document.querySelector("#folderBtn"),
  dropZone: document.querySelector("#dropZone"),
  previewCanvas: document.querySelector("#previewCanvas"),
  emptyState: document.querySelector("#emptyState"),
  imageMeta: document.querySelector("#imageMeta"),
  sliceMeta: document.querySelector("#sliceMeta"),
  downloadBtn: document.querySelector("#downloadBtn"),
  exportFolderBtn: document.querySelector("#exportFolderBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  customSliceBtn: document.querySelector("#customSliceBtn"),
  customSliceModal: document.querySelector("#customSliceModal"),
  customSliceClose: document.querySelector("#customSliceClose"),
  customSliceCancel: document.querySelector("#customSliceCancel"),
  customSliceRestore: document.querySelector("#customSliceRestore"),
  customSliceApply: document.querySelector("#customSliceApply"),
  customSliceImage: document.querySelector("#customSliceImage"),
  customSliceStage: document.querySelector("#customSliceStage"),
  customGrid: document.querySelector("#customGrid"),
  customAddHorizontal: document.querySelector("#customAddHorizontal"),
  customAddVertical: document.querySelector("#customAddVertical"),
  customDeleteGuide: document.querySelector("#customDeleteGuide"),
  customClearGuides: document.querySelector("#customClearGuides"),
  customGridReset: document.querySelector("#customGridReset"),
  customSliceCount: document.querySelector("#customSliceCount"),
  customSliceMeta: document.querySelector("#customSliceMeta"),
  sliceBtn: document.querySelector("#sliceBtn"),
  thumbGrid: document.querySelector("#thumbGrid"),
  previewLinks: document.querySelector("#previewLinks"),
  resultCount: document.querySelector("#resultCount"),
  resultsSection: document.querySelector("#resultsSection"),
  importCount: document.querySelector("#importCount"),
  importList: document.querySelector("#importList"),
  clearQueueBtn: document.querySelector("#clearQueueBtn"),
  alphaThreshold: document.querySelector("#alphaThreshold"),
  alphaOutput: document.querySelector("#alphaOutput"),
  colorTolerance: document.querySelector("#colorTolerance"),
  toleranceOutput: document.querySelector("#toleranceOutput"),
  minArea: document.querySelector("#minArea"),
  mergeGap: document.querySelector("#mergeGap"),
  detectBackground: document.querySelector("#detectBackground"),
  groupTextLabels: document.querySelector("#groupTextLabels"),
  textMaxHeight: document.querySelector("#textMaxHeight"),
  useSourceName: document.querySelector("#useSourceName"),
  articleId: document.querySelector("#articleId"),
  articleTitle: document.querySelector("#articleTitle"),
  startIndex: document.querySelector("#startIndex"),
  sequenceDigits: document.querySelector("#sequenceDigits"),
  padding: document.querySelector("#padding"),
  exportFormat: document.querySelector("#exportFormat"),
  backgroundMode: document.querySelector("#backgroundMode"),
  namePreview: document.querySelector("#namePreview"),
  sliceLightbox: document.querySelector("#sliceLightbox"),
  lightboxClose: document.querySelector("#lightboxClose"),
  lightboxImage: document.querySelector("#lightboxImage"),
  lightboxCaption: document.querySelector("#lightboxCaption"),
};

const previewCtx = els.previewCanvas.getContext("2d");
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });

let sourceImage = null;
let sourceFileName = "";
let images = [];
let slices = [];
let activeSourceRecord = null;
let imageIdCounter = 0;
let hasRunBatch = false;
let isProcessing = false;
let activeLightboxUrl = "";
let lightboxSlices = [];
let lightboxIndex = 0;
let customGridState = { columns: 1, rows: 1, vertical: [], horizontal: [] };
let customGridImage = null;
let customGuideBands = null;
let selectedCustomGuide = null;
const activeSliceSaves = new Set();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const numberValue = (input, fallback = 0) => {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
};

const debounce = (fn, wait = 180) => {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
};

function sanitizeNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseSourceName(fileName) {
  const cleanName = String(fileName || "").trim();
  const articleMatch = cleanName.match(/^(\d+)[\s_-]+(.+)$/);

  if (!articleMatch) {
    return { articleId: "", title: cleanName };
  }

  return {
    articleId: articleMatch[1],
    title: articleMatch[2].replace(/[\s_-]*\d+$/, "").trim(),
  };
}

function applyNameFromSource(fileName) {
  const parsed = parseSourceName(fileName);

  if (els.articleId && parsed.articleId && !els.articleId.value.trim()) {
    els.articleId.value = parsed.articleId;
  }

  if (els.articleTitle && parsed.title && !els.articleTitle.value.trim()) {
    els.articleTitle.value = parsed.title;
  }

  updateNamePreview();
}

function getNameParts() {
  const articleId = sanitizeNamePart(els.articleId?.value);
  const title = sanitizeNamePart(els.articleTitle?.value) || sanitizeNamePart(sourceFileName) || "image";
  return { articleId, title };
}

function getBaseName(fileName = sourceFileName) {
  return sanitizeNamePart(fileName) || "image";
}

function getSequenceNumber(index) {
  const start = Math.max(1, Math.floor(numberValue(els.startIndex, 1)));
  return start + index;
}

function getSequenceLabel(index) {
  const digits = clamp(Math.floor(numberValue(els.sequenceDigits, 2)), 1, 4);
  return String(getSequenceNumber(index)).padStart(digits, "0");
}

function getExportExtension() {
  return els.exportFormat.value === "jpeg" ? "jpg" : els.exportFormat.value;
}

function buildSliceName(index, fileName = sourceFileName) {
  return `${getBaseName(fileName)}-${getSequenceLabel(index)}`;
}

function getExportFileName(slice) {
  return `${slice.name}.${getExportExtension()}`;
}

function updateNamePreview() {
  const firstName = images[0]?.fileName || sourceFileName || "image";
  const firstSlice = images[0]?.slices?.[0];
  els.namePreview.textContent = firstSlice
    ? getExportFileName(firstSlice)
    : `${buildSliceName(0, firstName)}.${getExportExtension()}`;
}

function refreshSliceNames() {
  images.forEach((image) => {
    image.slices = image.slices.map((slice, index) => ({
      ...slice,
      index,
      name: buildSliceName(index, image.fileName),
    }));
  });
  slices = images.flatMap((image) => image.slices);
  updateNamePreview();
  renderThumbs();
  drawPreview();
}

function updateImportList() {
  els.importCount.textContent = `${images.length} 张`;
  els.clearQueueBtn.disabled = isProcessing || !images.length;
  els.importList.innerHTML = "";

  if (!images.length) {
    const empty = document.createElement("span");
    empty.textContent = "还没有导入图片";
    els.importList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  images.forEach((image) => {
    const item = document.createElement("div");
    const button = document.createElement("button");
    const removeButton = document.createElement("button");
    const sliceText = hasRunBatch
      ? image.slices[0]?.fullImageOutput
        ? " · 整图输出"
        : ` · ${image.slices.length} 张切片`
      : "";
    item.className = "import-item";
    item.classList.toggle("is-active", image === activeSourceRecord);
    button.className = "import-chip";
    button.type = "button";
    button.textContent = `${image.displayName} · ${image.width}×${image.height}${sliceText}`;
    button.addEventListener("click", () => {
      setActiveImage(image);
      updateImportList();
      drawPreview();
    });
    removeButton.className = "remove-import-button";
    removeButton.type = "button";
    removeButton.title = `移除 ${image.displayName}`;
    removeButton.setAttribute("aria-label", `移除 ${image.displayName}`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => removeImageFromQueue(image.id));
    item.append(button, removeButton);
    fragment.append(item);
  });

  els.importList.append(fragment);
}

function closeImageRecord(image) {
  image?.bitmap?.close?.();
}

function clearPreviewSurface() {
  releasePreviewObjectUrls();
  previewCtx.setTransform(1, 0, 0, 1, 0, 0);
  previewCtx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
  els.previewCanvas.width = 0;
  els.previewCanvas.height = 0;
  els.previewCanvas.style.width = "";
  els.previewCanvas.style.height = "";
  els.previewLinks.innerHTML = "";
  els.previewLinks.style.width = "";
  els.previewLinks.style.height = "";
}

function syncSlicesFromImages() {
  slices = images.flatMap((image) => image.slices);
  hasRunBatch = images.length > 0 && slices.length > 0 && images.some((image) => image.slices.length > 0);
}

function setQueueAfterRemoval(nextImages, nextActiveImage = null) {
  images = nextImages;
  syncSlicesFromImages();
  setActiveImage(nextActiveImage || images[0] || null);

  if (!images.length) {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    clearPreviewSurface();
    els.imageMeta.textContent = "尚未载入图片";
    els.sliceMeta.textContent = "等待切图";
    els.emptyState.classList.remove("is-hidden");
  } else {
    drawPreview();
  }

  updateImportList();
  updateNamePreview();
  renderThumbs();
  updateActions();
}

function removeImageFromQueue(imageId) {
  if (isProcessing) {
    return;
  }

  const removedImage = images.find((image) => image.id === imageId);
  if (!removedImage) {
    return;
  }

  const nextImages = images.filter((image) => image.id !== imageId);
  const nextActiveImage = removedImage === activeSourceRecord ? nextImages[0] : activeSourceRecord;
  closeImageRecord(removedImage);
  setQueueAfterRemoval(nextImages, nextActiveImage);
}

function clearQueue() {
  if (isProcessing || !images.length) {
    return;
  }

  images.forEach(closeImageRecord);
  setQueueAfterRemoval([]);
}

async function createImageRecord(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0);

  return {
    id: imageIdCounter += 1,
    file,
    originalName: file.name,
    displayName: file.webkitRelativePath || file.relativePath || file.name,
    fileName: file.name.replace(/\.[^.]+$/, ""),
    originalType: file.type || "image/png",
    bitmap,
    canvas,
    width: bitmap.width,
    height: bitmap.height,
    slices: [],
    manualSlices: null,
  };
}

function setActiveImage(image) {
  activeSourceRecord = image || null;
  sourceImage = image?.bitmap || null;
  sourceFileName = image?.fileName || "";
  sourceCanvas.width = image?.width || 0;
  sourceCanvas.height = image?.height || 0;

  if (image) {
    sourceCtx.clearRect(0, 0, image.width, image.height);
    sourceCtx.drawImage(image.canvas, 0, 0);
  }
}

const IMAGE_FILE_RE = /\.(png|jpe?g|webp)$/i;

function isImageFile(file) {
  return Boolean(file && (file.type?.startsWith("image/") || IMAGE_FILE_RE.test(file.name || "")));
}

function uniqueFiles(files) {
  const seen = new Set();
  return files.filter((file) => {
    const key = [
      file.relativePath || file.webkitRelativePath || "",
      file.name,
      file.size,
      file.lastModified,
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function loadFiles(fileList) {
  const files = uniqueFiles(Array.from(fileList || []).filter(isImageFile));
  if (!files.length) {
    return;
  }

  isProcessing = true;
  updateActions("导入中...");
  const failedFiles = [];

  for (const file of files) {
    try {
      const image = await createImageRecord(file);
      images.push(image);

      if (!activeSourceRecord) {
        setActiveImage(image);
        applyNameFromSource(image.fileName);
      }
    } catch (error) {
      failedFiles.push(file.name);
      console.error(`图片读取失败：${file.name}`, error);
    }
  }
  isProcessing = false;

  clearGeneratedResults();
  updateImportList();
  updateNamePreview();
  drawPreview();
  updateActions();

  if (failedFiles.length) {
    alert(`以下 ${failedFiles.length} 张图片读取失败：\n${failedFiles.join("\n")}`);
  }
}

function readDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

function getFileFromEntry(entry, relativePath = "") {
  return new Promise((resolve, reject) => {
    entry.file((file) => {
      if (relativePath) {
        Object.defineProperty(file, "relativePath", {
          configurable: true,
          value: `${relativePath}${file.name}`,
        });
      }
      resolve(file);
    }, reject);
  });
}

async function collectFilesFromEntry(entry, relativePath = "") {
  if (entry.isFile) {
    return [await getFileFromEntry(entry, relativePath)];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const reader = entry.createReader();
  const files = [];
  let batch = [];

  do {
    batch = await readDirectoryEntries(reader);
    for (const childEntry of batch) {
      files.push(...await collectFilesFromEntry(childEntry, `${relativePath}${entry.name}/`));
    }
  } while (batch.length);

  return files;
}

async function getDroppedFiles(dataTransfer) {
  // Drag data can become unavailable after the first await. Capture every
  // direct file and entry synchronously before reading any folders.
  const directFiles = Array.from(dataTransfer.files || []).filter(isImageFile);
  const droppedItems = Array.from(dataTransfer.items || [])
    .filter((item) => !item.kind || item.kind === "file")
    .map((item) => ({
      entry: item.webkitGetAsEntry?.() || null,
      file: item.getAsFile?.() || null,
    }));
  const files = [...directFiles];

  for (const { entry, file } of droppedItems) {
    if (entry?.isDirectory) {
      try {
        files.push(...await collectFilesFromEntry(entry));
        continue;
      } catch (error) {
        console.warn("拖入目录读取失败，改用普通文件读取。", error);
      }
    }

    if (!directFiles.length && isImageFile(file)) {
      files.push(file);
    }
  }

  return uniqueFiles(files.filter(isImageFile));
}

function resetTool() {
  images.forEach((image) => image.bitmap.close?.());
  closeSliceViewer();
  closeCustomSliceEditor();
  sourceImage = null;
  sourceFileName = "";
  activeSourceRecord = null;
  images = [];
  slices = [];
  hasRunBatch = false;
  imageIdCounter = 0;
  sourceCanvas.width = 0;
  sourceCanvas.height = 0;
  clearPreviewSurface();
  els.fileInput.value = "";
  els.imageMeta.textContent = "尚未载入图片";
  els.sliceMeta.textContent = "等待切图";
  els.emptyState.classList.remove("is-hidden");
  updateImportList();
  updateNamePreview();
  renderThumbs();
  updateActions();
}

function findBlankBands(counts, minWidth) {
  const bands = [];
  let start = 0;
  for (let end = 0; end <= counts.length; end += 1) {
    if (end < counts.length && !counts[end]) {
      continue;
    }
    if (end - start >= minWidth) {
      bands.push({ start, end });
    }
    start = end + 1;
  }
  return bands;
}

function getCustomGuideBands(image) {
  const { width, height, canvas } = image;
  const imageData = canvas.getContext("2d").getImageData(0, 0, width, height);
  const background = getBackgroundColor(imageData);
  const columns = new Uint32Array(width);
  const rows = new Uint32Array(height);

  // Keep these guides stricter than automatic crop recognition, even with a high color tolerance.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isContentPixel(imageData.data, (y * width + x) * 4, background, 4, 6, true)) {
        columns[x] += 1;
        rows[y] += 1;
      }
    }
  }

  const normalize = (counts) => findBlankBands(counts, Math.max(4, Math.ceil(counts.length * 0.008)))
    .map(({ start, end }) => ({
      start: start / counts.length,
      end: end / counts.length,
    }))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));

  return { vertical: normalize(columns), horizontal: normalize(rows) };
}

function isInteriorGuideBand(band) {
  return band.start > 0 && band.end < 1;
}

function chooseCustomGuide(bands, stops) {
  for (const { start, end } of bands) {
    if (stops.some((stop) => stop >= start && stop <= end)) {
      continue;
    }

    const position = (start + end) / 2;
    if (position >= 0.02 && position <= 0.98 &&
        stops.every((stop) => Math.abs(position - stop) >= 0.02)) {
      return position;
    }
  }
  return null;
}

function guessCustomGrid() {
  const suggestions = (direction) => {
    const bands = customGuideBands[direction].filter(isInteriorGuideBand);
    const stops = [];
    while (stops.length < 11) {
      const position = chooseCustomGuide(bands, stops);
      if (position === null) {
        break;
      }
      stops.push(position);
    }
    return stops;
  };

  return { vertical: suggestions("vertical"), horizontal: suggestions("horizontal") };
}

function setCustomGuides(guides = {}) {
  const vertical = [...(guides.vertical || [])]
    .map((value) => clamp(Number(value), 0.02, 0.98))
    .sort((a, b) => a - b)
    .slice(0, 11);
  const horizontal = [...(guides.horizontal || [])]
    .map((value) => clamp(Number(value), 0.02, 0.98))
    .sort((a, b) => a - b)
    .slice(0, 11);
  customGridState = {
    columns: vertical.length + 1,
    rows: horizontal.length + 1,
    vertical,
    horizontal,
  };
  selectedCustomGuide = null;
  renderCustomGrid();
}

function resetCustomGrid() {
  if (!customGridImage) {
    setCustomGuides();
    return;
  }
  setCustomGuides(guessCustomGrid());
}

function addCustomGuide(direction) {
  const stops = direction === "vertical" ? customGridState.vertical : customGridState.horizontal;
  if (stops.length >= 11) {
    return;
  }
  const bands = customGuideBands[direction];
  const interior = bands.filter(isInteriorGuideBand);
  const position = chooseCustomGuide(interior.length ? interior : bands, stops);
  if (position === null) {
    els.customSliceCount.textContent = direction === "vertical"
      ? "没有可用的纵向空白带"
      : "没有可用的横向空白带";
    return;
  }
  stops.push(position);
  stops.sort((a, b) => a - b);
  customGridState.columns = customGridState.vertical.length + 1;
  customGridState.rows = customGridState.horizontal.length + 1;
  selectedCustomGuide = { direction, index: stops.indexOf(position) };
  renderCustomGrid();
}

function clearCustomGuides() {
  setCustomGuides();
}

function deleteSelectedCustomGuide() {
  if (!selectedCustomGuide) {
    return;
  }
  const { direction, index } = selectedCustomGuide;
  const stops = direction === "vertical" ? customGridState.vertical : customGridState.horizontal;
  stops.splice(index, 1);
  customGridState.columns = customGridState.vertical.length + 1;
  customGridState.rows = customGridState.horizontal.length + 1;
  selectedCustomGuide = null;
  renderCustomGrid();
}

function positionCustomGrid() {
  if (!customGridImage || !els.customGrid || !els.customSliceStage) {
    return;
  }

  const imageRect = els.customSliceImage.getBoundingClientRect();
  const stageRect = els.customSliceStage.getBoundingClientRect();
  els.customGrid.style.left = `${imageRect.left - stageRect.left}px`;
  els.customGrid.style.top = `${imageRect.top - stageRect.top}px`;
  els.customGrid.style.width = `${imageRect.width}px`;
  els.customGrid.style.height = `${imageRect.height}px`;
}

function updateCustomGridLabel() {
  const count = customGridState.columns * customGridState.rows;
  els.customSliceCount.textContent = `${count} 个区域 · 纯空白区域不会导出`;
}

function renderCustomGrid() {
  if (!els.customGrid) {
    return;
  }

  els.customGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const addLine = (direction, position, index) => {
    const line = document.createElement("div");
    line.className = `custom-grid-line ${direction}`;
    line.classList.toggle(
      "is-selected",
      selectedCustomGuide?.direction === direction && selectedCustomGuide?.index === index,
    );
    line.style[direction === "vertical" ? "left" : "top"] = `${position * 100}%`;
    line.dataset.direction = direction;
    line.dataset.index = String(index);
    line.addEventListener("pointerdown", startCustomGridDrag);
    fragment.append(line);
  };

  customGridState.vertical.forEach((position, index) => addLine("vertical", position, index));
  customGridState.horizontal.forEach((position, index) => addLine("horizontal", position, index));

  let sequence = 1;
  for (let row = 0; row < customGridState.rows; row += 1) {
    const columns = Array.from({ length: customGridState.columns }, (_, index) => index);
    if (row % 2 === 1) {
      columns.reverse();
    }
    for (const column of columns) {
      const label = document.createElement("span");
      const left = column ? customGridState.vertical[column - 1] : 0;
      const right = column < customGridState.columns - 1 ? customGridState.vertical[column] : 1;
      const top = row ? customGridState.horizontal[row - 1] : 0;
      const bottom = row < customGridState.rows - 1 ? customGridState.horizontal[row] : 1;
      label.className = "custom-grid-label";
      label.textContent = String(sequence);
      label.style.left = `${left * 100}%`;
      label.style.top = `${top * 100}%`;
      label.style.width = `${(right - left) * 100}%`;
      label.style.height = `${(bottom - top) * 100}%`;
      fragment.append(label);
      sequence += 1;
    }
  }

  els.customGrid.append(fragment);
  els.customDeleteGuide.disabled = !selectedCustomGuide;
  updateCustomGridLabel();
  requestAnimationFrame(positionCustomGrid);
}

function startCustomGridDrag(event) {
  event.preventDefault();
  event.stopPropagation();
  const line = event.currentTarget;
  const direction = line.dataset.direction;
  const index = Number(line.dataset.index);
  selectedCustomGuide = { direction, index };
  els.customGrid.querySelectorAll(".custom-grid-line.is-selected")
    .forEach((item) => item.classList.remove("is-selected"));
  line.classList.add("is-selected");
  els.customDeleteGuide.disabled = false;
  const rect = els.customGrid.getBoundingClientRect();
  const stops = direction === "vertical" ? customGridState.vertical : customGridState.horizontal;
  const min = index === 0 ? 0.02 : stops[index - 1] + 0.02;
  const max = index === stops.length - 1 ? 0.98 : stops[index + 1] - 0.02;
  const move = (moveEvent) => {
    const raw = direction === "vertical"
      ? (moveEvent.clientX - rect.left) / Math.max(1, rect.width)
      : (moveEvent.clientY - rect.top) / Math.max(1, rect.height);
    stops[index] = clamp(raw, min, max);
    line.style[direction === "vertical" ? "left" : "top"] = `${stops[index] * 100}%`;
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    renderCustomGrid();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
}

function openCustomSliceEditor() {
  const image = activeSourceRecord || images[0];
  if (!image || isProcessing) {
    return;
  }

  customGridImage = image;
  customGuideBands = getCustomGuideBands(image);
  els.customSliceImage.src = image.canvas.toDataURL("image/png");
  els.customSliceMeta.textContent = `${image.displayName} · ${image.width} × ${image.height}px · 拖动横线和竖线调整切片范围`;
  els.customSliceModal.classList.remove("is-hidden");
  document.body.classList.add("has-lightbox");
  setActiveImage(image);
  setCustomGuides(image.manualGrid || guessCustomGrid());
}

function closeCustomSliceEditor() {
  if (!els.customSliceModal) {
    return;
  }
  els.customSliceModal.classList.add("is-hidden");
  els.customSliceImage.removeAttribute("src");
  customGridImage = null;
  customGuideBands = null;
  if (els.sliceLightbox?.classList.contains("is-hidden")) {
    document.body.classList.remove("has-lightbox");
  }
}

function buildCustomSlices(image) {
  const xStops = [0, ...customGridState.vertical, 1];
  const yStops = [0, ...customGridState.horizontal, 1];
  const boxes = [];

  for (let row = 0; row < yStops.length - 1; row += 1) {
    const columns = Array.from({ length: xStops.length - 1 }, (_, index) => index);
    if (row % 2 === 1) {
      columns.reverse();
    }
    for (const column of columns) {
      const x = Math.round(xStops[column] * image.width);
      const y = Math.round(yStops[row] * image.height);
      const right = Math.round(xStops[column + 1] * image.width);
      const bottom = Math.round(yStops[row + 1] * image.height);
      boxes.push({
        x,
        y,
        w: Math.max(1, right - x),
        h: Math.max(1, bottom - y),
        customOutput: true,
      });
    }
  }
  return boxes;
}

function applyCustomSlices() {
  if (!customGridImage || isProcessing) {
    return;
  }

  const customImage = customGridImage;

  isProcessing = true;
  updateActions("处理中...");
  try {
    customImage.manualSlices = buildCustomSlices(customImage);
    customImage.manualGrid = {
      vertical: [...customGridState.vertical],
      horizontal: [...customGridState.horizontal],
    };
    for (const image of images) {
      setActiveImage(image);
      image.slices = autoSlicesOrOriginal(image);
    }
    slices = images.flatMap((image) => image.slices);
    hasRunBatch = true;
    setActiveImage(customImage);
  } finally {
    isProcessing = false;
  }

  closeCustomSliceEditor();
  updateImportList();
  updateNamePreview();
  drawPreview();
  renderThumbs();
  updateActions();
}

function restoreCustomSliceToAuto() {
  if (!customGridImage || isProcessing) {
    return;
  }

  customGridImage.manualSlices = null;
  customGridImage.manualGrid = null;
  closeCustomSliceEditor();
  markNeedsConfirm();
}

function clearGeneratedResults() {
  images.forEach((image) => {
    image.slices = [];
  });
  slices = [];
  hasRunBatch = false;
  releasePreviewObjectUrls();
  els.previewLinks.innerHTML = "";
  renderThumbs();
  updateImportList();
}

function getPreviewSlices(image) {
  if (!image) {
    return [];
  }

  if (hasRunBatch) {
    return image.slices;
  }

  setActiveImage(image);
  return autoSlicesOrOriginal(image);
}

function markNeedsConfirm() {
  if (!images.length) {
    renderThumbs();
    updateActions();
    return;
  }

  clearGeneratedResults();
  drawPreview();
  updateActions();
}

function createOriginalOutputSlice(image) {
  return {
    x: 0,
    y: 0,
    w: image.width,
    h: image.height,
    index: 0,
    source: image,
    imageId: image.id,
    name: buildSliceName(0, image.fileName),
    fullImageOutput: true,
  };
}

function isPhoneLikeSlice(box, imageWidth, imageHeight) {
  const ratio = box.w / Math.max(1, box.h);
  const heightRatio = box.h / Math.max(1, imageHeight);
  const widthRatio = box.w / Math.max(1, imageWidth);

  return (
    box.h >= Math.min(420, imageHeight * 0.3) &&
    heightRatio >= 0.3 &&
    widthRatio <= 0.72 &&
    ratio >= 0.25 &&
    ratio <= 0.82
  );
}

function hasStandardPhoneRow(boxes, imageWidth, imageHeight) {
  const phoneBoxes = boxes
    .filter((box) => isPhoneLikeSlice(box, imageWidth, imageHeight))
    .sort(readingOrderSort);

  if (phoneBoxes.length < 2) {
    return false;
  }

  if (phoneBoxes.length / boxes.length < 0.65) {
    return false;
  }

  const rowTolerance = Math.max(80, imageHeight * 0.16);
  const rows = [];
  phoneBoxes.forEach((box) => {
    const row = rows.find((items) => Math.abs(items[0].y - box.y) <= rowTolerance);
    if (row) {
      row.push(box);
    } else {
      rows.push([box]);
    }
  });

  return rows.some((row) => {
    if (row.length < 2) {
      return false;
    }

    const sorted = [...row].sort((a, b) => a.x - b.x);
    const heights = sorted.map((box) => box.h).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)];
    const similarHeights = sorted.every((box) => box.h >= medianHeight * 0.68 && box.h <= medianHeight * 1.35);
    const mostlySeparate = sorted.every((box, index) => {
      if (index === 0) {
        return true;
      }

      const previous = sorted[index - 1];
      const overlap = getHorizontalOverlap(previous, box);
      return overlap / Math.max(1, Math.min(previous.w, box.w)) <= 0.18;
    });

    return similarHeights && mostlySeparate;
  });
}

function hasStandardLandscapeStack(boxes, imageWidth, imageHeight) {
  if (boxes.length < 2 || boxes.length > 12) {
    return false;
  }

  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  const widths = sorted.map((box) => box.w).sort((a, b) => a - b);
  const heights = sorted.map((box) => box.h).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)];
  const medianHeight = heights[Math.floor(heights.length / 2)];

  return sorted.every((box, index) => {
    const ratio = box.w / Math.max(1, box.h);
    const aligned = Math.abs(boxCenterX(box) - imageWidth / 2) <= imageWidth * 0.12;
    const similarSize =
      box.w >= medianWidth * 0.82 &&
      box.w <= medianWidth * 1.18 &&
      box.h >= medianHeight * 0.72 &&
      box.h <= medianHeight * 1.35;
    const separated = index === 0 || sorted[index - 1].y + sorted[index - 1].h <= box.y + imageHeight * 0.02;

    return (
      ratio >= 1.15 &&
      box.w >= imageWidth * 0.65 &&
      box.h >= imageHeight * 0.12 &&
      aligned &&
      similarSize &&
      separated
    );
  });
}

function autoSlicesOrOriginal(image) {
  let candidates = image.manualSlices;
  if (!candidates) {
    const detectedSlices = autoDetectSlices();
    candidates = detectedSlices[0]?.fourImageGrid ||
      hasStandardPhoneRow(detectedSlices, image.width, image.height) ||
      hasStandardLandscapeStack(detectedSlices, image.width, image.height)
      ? detectedSlices
      : [createOriginalOutputSlice(image)];
  }

  return filterVisibleSlices(
    candidates.map((slice) => ({ ...slice, source: image, imageId: image.id })),
    (slice) => renderSliceCanvas(slice, els.exportFormat.value),
    (index) => buildSliceName(index, image.fileName),
  );
}

async function runSlice() {
  if (!images.length || isProcessing) {
    updateActions();
    return;
  }

  isProcessing = true;
  updateActions("切图中...");
  slices = [];

  try {
    const previewImage = activeSourceRecord || images[0];
    for (const image of images) {
      setActiveImage(image);
      image.slices = autoSlicesOrOriginal(image);
      slices.push(...image.slices);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    hasRunBatch = true;
    setActiveImage(previewImage);
  } finally {
    isProcessing = false;
  }

  updateImportList();
  drawPreview();
  renderThumbs();
  updateActions();
}

function getBackgroundColor(imageData) {
  const { width, height, data } = imageData;
  const points = [
    0,
    width - 1,
    (height - 1) * width,
    height * width - 1,
  ];
  const totals = [0, 0, 0, 0];

  points.forEach((pixelIndex) => {
    const index = pixelIndex * 4;
    totals[0] += data[index];
    totals[1] += data[index + 1];
    totals[2] += data[index + 2];
    totals[3] += data[index + 3];
  });

  return totals.map((value) => value / points.length);
}

function isContentPixel(data, index, background, alphaThreshold, tolerance, detectBackground) {
  const alpha = data[index + 3];
  if (alpha <= alphaThreshold) {
    return false;
  }

  if (!detectBackground) {
    return true;
  }

  const dr = data[index] - background[0];
  const dg = data[index + 1] - background[1];
  const db = data[index + 2] - background[2];
  const da = alpha - background[3];
  const distance = Math.sqrt(dr * dr + dg * dg + db * db + da * da * 0.2);
  return distance > tolerance;
}

function isLikelyTitleLabel(box, area, imageWidth, imageHeight) {
  if (!els.groupTextLabels.checked) {
    return false;
  }

  const maxTextHeight = Math.max(1, numberValue(els.textMaxHeight, 90));
  const aspectRatio = box.w / box.h;
  const fillRatio = area / (box.w * box.h);
  const relativeHeight = box.h / imageHeight;

  return (
    box.h <= maxTextHeight &&
    fillRatio <= 0.78 &&
    (relativeHeight <= 0.22 || aspectRatio >= 1.2 || box.w <= maxTextHeight * 1.25) &&
    box.w <= imageWidth * 0.92
  );
}

function isPrimaryImageBox(box, imageWidth, imageHeight) {
  return (
    box.h > numberValue(els.textMaxHeight, 90) ||
    box.w >= imageWidth * 0.18 ||
    box.h >= imageHeight * 0.18 ||
    box.w * box.h >= imageWidth * imageHeight * 0.025
  );
}

function getHorizontalOverlap(a, b) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
}

function getVerticalOverlap(a, b) {
  return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

function boxCenterX(box) {
  return box.x + box.w / 2;
}

function boxCenterY(box) {
  return box.y + box.h / 2;
}

function isBoxInside(inner, outer) {
  const innerCenterX = inner.x + inner.w / 2;
  const innerCenterY = inner.y + inner.h / 2;
  return (
    innerCenterX >= outer.x &&
    innerCenterX <= outer.x + outer.w &&
    innerCenterY >= outer.y &&
    innerCenterY <= outer.y + outer.h
  );
}

function isTitleForImage(title, image, imageHeight) {
  const verticalGap = image.y - (title.y + title.h);
  const maxTitleGap = Math.max(numberValue(els.textMaxHeight, 120) * 2, imageHeight * 0.12);
  const overlap = getHorizontalOverlap(title, image);
  const overlapRatio = overlap / Math.max(1, Math.min(title.w, image.w));
  const titleCenter = boxCenterX(title);
  const horizontalPadding = Math.max(24, image.w * 0.12);

  return (
    verticalGap >= 0 &&
    verticalGap <= maxTitleGap &&
    (overlapRatio >= 0.2 ||
      (titleCenter >= image.x - horizontalPadding && titleCenter <= image.x + image.w + horizontalPadding))
  );
}

function cropMaskBand(
  mask, padding, imageWidth, imageHeight, leftLimit, rightLimit, topLimit = 0, bottomLimit = imageHeight,
) {
  let minX = rightLimit;
  let maxX = leftLimit;
  let minY = imageHeight;
  let maxY = 0;

  for (let y = topLimit; y < bottomLimit; y += 1) {
    const rowOffset = y * imageWidth;
    for (let x = leftLimit; x < rightLimit; x += 1) {
      if (!mask[rowOffset + x]) {
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (minX > maxX || minY > maxY) {
    return null;
  }

  return expandBox(
    { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    padding,
    imageWidth,
    imageHeight,
  );
}

function removeTransitionArrows(mask, data, imageWidth, imageHeight) {
  const redMask = new Uint8Array(mask.length);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (
      red > 180 &&
      green < 130 &&
      blue < 130 &&
      red - green > 80 &&
      red - blue > 80
    ) {
      redMask[pixel] = 1;
    }
  }

  const arrows = [];
  const stack = [];
  const componentPixels = [];
  const maxArrowSize = Math.max(80, Math.min(imageWidth, imageHeight) * 0.08);

  for (let start = 0; start < redMask.length; start += 1) {
    if (!redMask[start]) {
      continue;
    }

    let minX = imageWidth;
    let minY = imageHeight;
    let maxX = 0;
    let maxY = 0;
    stack.push(start);
    redMask[start] = 0;
    componentPixels.length = 0;

    while (stack.length) {
      const current = stack.pop();
      const x = current % imageWidth;
      const y = Math.floor(current / imageWidth);
      componentPixels.push(current);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) {
            continue;
          }
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= imageWidth || nextY < 0 || nextY >= imageHeight) {
            continue;
          }
          const next = nextY * imageWidth + nextX;
          if (redMask[next]) {
            redMask[next] = 0;
            stack.push(next);
          }
        }
      }
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const fillRatio = componentPixels.length / Math.max(1, width * height);
    const horizontalArrow = width >= 60 && width / Math.max(1, height) >= 2.2;
    const verticalArrow = height >= 60 && height / Math.max(1, width) >= 2.2;
    const isArrow =
      componentPixels.length >= 80 &&
      fillRatio <= 0.48 &&
      Math.max(width, height) <= maxArrowSize &&
      (horizontalArrow || verticalArrow);

    if (!isArrow) {
      continue;
    }

    componentPixels.forEach((pixel) => {
      mask[pixel] = 0;
    });
    arrows.push({ x: minX, y: minY, w: width, h: height });
  }

  return arrows;
}

function medianValue(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function getProjectionColumnCenters(columns) {
  const medianWidth = medianValue(columns.map((column) => column.w));
  return columns.map((column) => {
    const effectiveWidth = column.w < medianWidth * 0.65 ? medianWidth : column.w;
    return column.x + effectiveWidth / 2;
  });
}

function recoverIncompletePhoneGrid(mask, padding, imageWidth, imageHeight, boxes) {
  const phoneBoxes = boxes.filter((box) => isPhoneLikeSlice(box, imageWidth, imageHeight));
  if (phoneBoxes.length !== boxes.length || phoneBoxes.length < 4) {
    return boxes;
  }

  const columns = detectProjectionColumnRuns(mask, imageWidth, imageHeight);
  if (columns.length < 3 || columns.length > 8) {
    return boxes;
  }

  const medianHeight = medianValue(phoneBoxes.map((box) => box.h));
  const rowTolerance = Math.max(60, medianHeight * 0.36);
  const rows = [];
  [...phoneBoxes]
    .sort((a, b) => boxCenterY(a) - boxCenterY(b))
    .forEach((box) => {
      const centerY = boxCenterY(box);
      const row = rows.find((item) => Math.abs(item.centerY - centerY) <= rowTolerance);
      if (row) {
        row.boxes.push(box);
        row.centerY = row.boxes.reduce((total, item) => total + boxCenterY(item), 0) / row.boxes.length;
      } else {
        rows.push({ centerY, boxes: [box] });
      }
    });

  const expectedColumns = columns.length;
  if (
    rows.length < 2 ||
    Math.max(...rows.map((row) => row.boxes.length)) !== expectedColumns ||
    rows.some((row) => row.boxes.length < expectedColumns - 2)
  ) {
    return boxes;
  }

  const recovered = [...boxes];
  rows.forEach((row) => {
    const assignedColumns = new Set();
    row.boxes.forEach((box) => {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      columns.forEach((column, index) => {
        const distance = Math.abs(boxCenterX(box) - boxCenterX(column));
        if (distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      });
      assignedColumns.add(nearestIndex);
    });

    if (assignedColumns.size === expectedColumns) {
      return;
    }

    const rowWidth = medianValue(row.boxes.map((box) => box.w));
    const rowHeight = medianValue(row.boxes.map((box) => box.h));
    const rowY = medianValue(row.boxes.map((box) => box.y));
    columns.forEach((column, columnIndex) => {
      if (assignedColumns.has(columnIndex)) {
        return;
      }

      const previous = columns[columnIndex - 1];
      const next = columns[columnIndex + 1];
      const leftLimit = previous ? Math.floor((previous.x + previous.w + column.x) / 2) : 0;
      const rightLimit = next ? Math.ceil((column.x + column.w + next.x) / 2) : imageWidth;
      const width = Math.min(rowWidth, rightLimit - leftLimit);
      const centerX = boxCenterX(column);
      const x = clamp(Math.round(centerX - width / 2), leftLimit, Math.max(leftLimit, rightLimit - width));
      recovered.push(expandBox(
        { x, y: rowY, w: width, h: rowHeight },
        0,
        imageWidth,
        imageHeight,
      ));
      recovered[recovered.length - 1].syntheticGridBox = true;
    });
  });

  return recovered;
}

function clipSlicesAroundArrows(boxes, arrows) {
  if (!arrows.length) {
    return boxes;
  }

  return boxes.map((box) => {
    let left = box.x;
    let top = box.y;
    let right = box.x + box.w;
    let bottom = box.y + box.h;

    arrows.forEach((arrow) => {
      const arrowRight = arrow.x + arrow.w;
      const arrowBottom = arrow.y + arrow.h;
      const intersects = left < arrowRight && right > arrow.x && top < arrowBottom && bottom > arrow.y;
      if (!intersects) {
        return;
      }

      if (arrow.w >= arrow.h) {
        if (boxCenterX(arrow) >= (left + right) / 2) {
          right = Math.min(right, arrow.x - 3);
        } else {
          left = Math.max(left, arrowRight + 3);
        }
      } else if (boxCenterY(arrow) >= (top + bottom) / 2) {
        bottom = Math.min(bottom, arrow.y - 3);
      } else {
        top = Math.max(top, arrowBottom + 3);
      }
    });

    return {
      ...box,
      x: left,
      y: top,
      w: Math.max(1, right - left),
      h: Math.max(1, bottom - top),
    };
  });
}

function boxesOverlapInSameRow(boxes) {
  return boxes.some((box, index) => boxes.slice(index + 1).some((other) => {
    const verticalOverlap = getVerticalOverlap(box, other);
    const horizontalOverlap = getHorizontalOverlap(box, other);
    return verticalOverlap >= Math.min(box.h, other.h) * 0.5 && horizontalOverlap > 0;
  }));
}

function prepareSafeSliceOutputs(boxes, arrows, padding, imageWidth, imageHeight) {
  const needsWhitePadding = arrows.length > 0 || boxesOverlapInSameRow(boxes);
  if (!needsWhitePadding || (padding <= 0 && !arrows.length)) {
    return boxes;
  }

  const prepared = boxes.map((box) => {
    const canExternalizePadding = !box.syntheticGridBox;
    const leftInset = canExternalizePadding && box.x > 0 ? Math.min(padding, Math.floor(box.w / 4)) : 0;
    const topInset = canExternalizePadding && box.y > 0 ? Math.min(padding, Math.floor(box.h / 4)) : 0;
    const rightInset = canExternalizePadding && box.x + box.w < imageWidth
      ? Math.min(padding, Math.floor(box.w / 4))
      : 0;
    const bottomInset = canExternalizePadding && box.y + box.h < imageHeight
      ? Math.min(padding, Math.floor(box.h / 4))
      : 0;

    return {
      ...box,
      sourceX: box.x + leftInset,
      sourceY: box.y + topInset,
      sourceW: Math.max(1, box.w - leftInset - rightInset),
      sourceH: Math.max(1, box.h - topInset - bottomInset),
      drawOffsetX: leftInset,
      drawOffsetY: topInset,
      forceWhiteCanvas: true,
    };
  });

  const targetWidth = arrows.length ? Math.max(...prepared.map((box) => box.w)) : 0;
  const targetHeight = arrows.length ? Math.max(...prepared.map((box) => box.h)) : 0;

  return prepared.map((box) => {
    const outputWidth = targetWidth || box.w;
    const outputHeight = targetHeight || box.h;
    const extraX = Math.round((outputWidth - box.w) / 2);
    const extraY = Math.round((outputHeight - box.h) / 2);
    const drawOffsetX = box.drawOffsetX + extraX;
    const drawOffsetY = box.drawOffsetY + extraY;
    const redactions = arrows
      .filter((arrow) => (
        box.sourceX < arrow.x + arrow.w &&
        box.sourceX + box.sourceW > arrow.x &&
        box.sourceY < arrow.y + arrow.h &&
        box.sourceY + box.sourceH > arrow.y
      ))
      .map((arrow) => ({
        x: drawOffsetX + arrow.x - box.sourceX - 6,
        y: drawOffsetY + arrow.y - box.sourceY - 6,
        w: arrow.w + 12,
        h: arrow.h + 12,
      }));

    return {
      ...box,
      w: outputWidth,
      h: outputHeight,
      drawOffsetX,
      drawOffsetY,
      redactions,
    };
  });
}

function recoverMergedThreeColumnRow(mask, padding, imageWidth, imageHeight, columnBoxes) {
  if (!mask || columnBoxes.length !== 2) {
    return [];
  }

  const boxes = [...columnBoxes].sort((a, b) => a.x - b.x);
  const wideIndex = boxes[0].w >= boxes[1].w ? 0 : 1;
  const wide = boxes[wideIndex];
  const narrow = boxes[1 - wideIndex];
  const widthRatio = wide.w / Math.max(1, narrow.w);
  const heightRatio = wide.h / Math.max(1, narrow.h);
  const imageRatio = imageWidth / Math.max(1, imageHeight);

  if (
    widthRatio < 1.7 ||
    widthRatio > 2.3 ||
    heightRatio < 0.82 ||
    heightRatio > 1.18 ||
    imageRatio < 1.25 ||
    imageRatio > 2.2
  ) {
    return [];
  }

  const splitWide = Math.round(wide.x + wide.w / 2);
  const wideRight = wide.x + wide.w;
  const separator = wideIndex === 0
    ? Math.round((wideRight + narrow.x) / 2)
    : Math.round((narrow.x + narrow.w + wide.x) / 2);
  const bands = wideIndex === 0
    ? [[0, splitWide], [splitWide, separator], [separator, imageWidth]]
    : [[0, separator], [separator, splitWide], [splitWide, imageWidth]];
  const recovered = bands
    .map(([left, right]) => cropMaskBand(mask, padding, imageWidth, imageHeight, left, right))
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);

  return recovered.length === 3 && recovered.every((box) => isPhoneLikeSlice(box, imageWidth, imageHeight))
    ? recovered
    : [];
}

function groupTitlesWithImages(
  components,
  padding,
  mergeGap,
  imageWidth,
  imageHeight,
  mask,
  recoveryMask = mask,
) {
  const phoneGridBoxes = detectPhoneGridSlices(
    mask,
    padding,
    imageWidth,
    imageHeight,
    recoveryMask,
  );
  const columnBoxes = detectColumnSlices(components, padding, imageWidth, imageHeight, mask);
  const sparseStackedColumns = splitSparseStackedColumn(
    recoveryMask,
    padding,
    imageWidth,
    imageHeight,
    columnBoxes,
  );
  if (sparseStackedColumns.length > columnBoxes.length) {
    return sparseStackedColumns;
  }
  const recoveredThreeColumns = recoverMergedThreeColumnRow(
    mask,
    padding,
    imageWidth,
    imageHeight,
    columnBoxes,
  );
  if (recoveredThreeColumns.length === 3) {
    return recoveredThreeColumns;
  }

  if (columnBoxes.length >= 2 && columnBoxes.length >= phoneGridBoxes.length) {
    return columnBoxes;
  }

  if (phoneGridBoxes.length >= 2) {
    return phoneGridBoxes;
  }

  if (!els.groupTextLabels.checked) {
    return mergeBoxes(components.map(({ area, ...box }) => box), mergeGap, imageWidth, imageHeight)
      .map((box) => expandBox(box, padding, imageWidth, imageHeight));
  }

  const titles = [];
  const nonTitles = [];

  components.forEach((component) => {
    if (isLikelyTitleLabel(component, component.area, imageWidth, imageHeight)) {
      titles.push(component);
    } else {
      nonTitles.push(component);
    }
  });

  const imageBoxes = nonTitles.filter((box) => isPrimaryImageBox(box, imageWidth, imageHeight));

  if (!imageBoxes.length) {
    return mergeBoxes(components.map(({ area, ...box }) => box), mergeGap, imageWidth, imageHeight)
      .map((box) => expandBox(box, padding, imageWidth, imageHeight));
  }

  const assignedTitles = new Set();
  const groupedImages = imageBoxes.map((image) => {
    let grouped = { ...image };

    titles.forEach((title, titleIndex) => {
      if (isTitleForImage(title, image, imageHeight)) {
        grouped = unionBox(grouped, title, imageWidth, imageHeight);
        assignedTitles.add(titleIndex);
      }
    });

    return grouped;
  });

  const extraBoxes = nonTitles.filter((box) => {
    if (imageBoxes.includes(box)) {
      return false;
    }
    return !imageBoxes.some((image) => isBoxInside(box, image));
  });

  const orphanTitles = titles.filter((_, titleIndex) => !assignedTitles.has(titleIndex));
  const grouped = mergeBoxes([...groupedImages, ...extraBoxes], mergeGap, imageWidth, imageHeight);

  if (!groupedImages.length) {
    grouped.push(...orphanTitles);
  }

  return grouped.map((box) => expandBox(box, padding, imageWidth, imageHeight));
}

function splitSparseStackedColumn(mask, padding, imageWidth, imageHeight, columnBoxes) {
  if (!mask || columnBoxes.length < 3) {
    return [];
  }

  const sortedBoxes = [...columnBoxes].sort((a, b) => a.x - b.x);
  const shortestHeight = Math.min(...sortedBoxes.map((box) => box.h));
  const tallBoxes = sortedBoxes.filter((box) => (
    box.h >= imageHeight * 0.78 && box.h >= shortestHeight * 1.65
  ));
  if (tallBoxes.length !== 1) {
    return [];
  }

  const tallBox = tallBoxes[0];
  const shortBoxes = sortedBoxes.filter((box) => box !== tallBox);
  const medianShortHeight = medianValue(shortBoxes.map((box) => box.h));
  const medianShortWidth = medianValue(shortBoxes.map((box) => box.w));
  const alignedTopRow = shortBoxes.every((box) => (
    Math.abs(box.y - shortBoxes[0].y) <= medianShortHeight * 0.18 &&
    box.h >= medianShortHeight * 0.78 &&
    box.h <= medianShortHeight * 1.25
  ));
  if (!alignedTopRow) {
    return [];
  }

  const splitY = Math.round(imageHeight / 2);
  const rowBands = [[0, splitY], [splitY, imageHeight]];
  const splitBoxes = rowBands.map(([topLimit, bottomLimit]) => {
    let minX = tallBox.x + tallBox.w;
    let maxX = tallBox.x;
    let minY = bottomLimit;
    let maxY = topLimit;
    let pixelCount = 0;
    const leftLimit = Math.max(0, tallBox.x);
    const rightLimit = Math.min(imageWidth, tallBox.x + tallBox.w);

    for (let y = topLimit; y < bottomLimit; y += 1) {
      const rowOffset = y * imageWidth;
      for (let x = leftLimit; x < rightLimit; x += 1) {
        if (!mask[rowOffset + x]) {
          continue;
        }
        pixelCount += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    if (!pixelCount || minX > maxX || minY > maxY) {
      return null;
    }

    const candidate = expandBox(
      { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      padding,
      imageWidth,
      imageHeight,
    );
    const similarSize =
      candidate.w >= medianShortWidth * 0.68 &&
      candidate.w <= medianShortWidth * 1.35 &&
      candidate.h >= medianShortHeight * 0.68 &&
      candidate.h <= medianShortHeight * 1.35;
    const enoughContent = pixelCount >= Math.max(5000, candidate.w * candidate.h * 0.012);

    return similarSize && enoughContent && isPhoneLikeSlice(candidate, imageWidth, imageHeight)
      ? { ...candidate, recoveredSparseCell: true }
      : null;
  }).filter(Boolean);

  return splitBoxes.length === 2 ? [...shortBoxes, ...splitBoxes] : [];
}

function recoverMissingPhoneGridCells(mask, padding, imageWidth, imageHeight, columns, boxes) {
  if (columns.length < 2 || boxes.length < 4) {
    return boxes;
  }

  const phoneBoxes = boxes.filter((box) => isPhoneLikeSlice(box, imageWidth, imageHeight));
  if (phoneBoxes.length !== boxes.length) {
    return boxes;
  }

  const medianHeight = medianValue(phoneBoxes.map((box) => box.h));
  const medianWidth = medianValue(phoneBoxes.map((box) => box.w));
  const rowTolerance = Math.max(80, medianHeight * 0.38);
  const rows = [];

  [...phoneBoxes]
    .sort((a, b) => boxCenterY(a) - boxCenterY(b))
    .forEach((box) => {
      const centerY = boxCenterY(box);
      const row = rows.find((item) => Math.abs(item.centerY - centerY) <= rowTolerance);
      if (row) {
        row.boxes.push(box);
        row.centerY = row.boxes.reduce((total, item) => total + boxCenterY(item), 0) / row.boxes.length;
      } else {
        rows.push({ centerY, boxes: [box] });
      }
    });

  rows.sort((a, b) => a.centerY - b.centerY);
  if (rows.length < 2 || Math.max(...rows.map((row) => row.boxes.length)) < 2) {
    return boxes;
  }

  const recovered = [...boxes];
  const columnCenters = getProjectionColumnCenters(columns);
  rows.forEach((row, rowIndex) => {
    const previousRow = rows[rowIndex - 1];
    const nextRow = rows[rowIndex + 1];
    const topLimit = previousRow ? Math.floor((previousRow.centerY + row.centerY) / 2) : 0;
    const bottomLimit = nextRow ? Math.ceil((row.centerY + nextRow.centerY) / 2) : imageHeight;

    columns.forEach((column, columnIndex) => {
      const alreadyDetected = row.boxes.some((box) => {
        let nearestColumn = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        columns.forEach((candidateColumn, candidateIndex) => {
          const distance = Math.abs(boxCenterX(box) - columnCenters[candidateIndex]);
          if (distance < nearestDistance) {
            nearestColumn = candidateIndex;
            nearestDistance = distance;
          }
        });
        return nearestColumn === columnIndex;
      });

      if (alreadyDetected) {
        return;
      }

      const previousColumn = columns[columnIndex - 1];
      const nextColumn = columns[columnIndex + 1];
      const leftLimit = previousColumn
        ? Math.floor((columnCenters[columnIndex - 1] + columnCenters[columnIndex]) / 2)
        : 0;
      const rightLimit = nextColumn
        ? Math.ceil((columnCenters[columnIndex] + columnCenters[columnIndex + 1]) / 2)
        : imageWidth;
      let minX = rightLimit;
      let maxX = leftLimit;
      let minY = bottomLimit;
      let maxY = topLimit;
      let pixelCount = 0;

      for (let y = topLimit; y < bottomLimit; y += 1) {
        const rowOffset = y * imageWidth;
        for (let x = leftLimit; x < rightLimit; x += 1) {
          if (!mask[rowOffset + x]) {
            continue;
          }
          pixelCount += 1;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }

      if (!pixelCount || minX > maxX || minY > maxY) {
        return;
      }

      const candidate = expandBox(
        { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        padding,
        imageWidth,
        imageHeight,
      );
      const similarSize =
        candidate.w >= medianWidth * 0.68 &&
        candidate.w <= medianWidth * 1.35 &&
        candidate.h >= medianHeight * 0.68 &&
        candidate.h <= medianHeight * 1.35;
      const enoughContent = pixelCount >= Math.max(5000, candidate.w * candidate.h * 0.015);

      if (!similarSize || !enoughContent || !isPhoneLikeSlice(candidate, imageWidth, imageHeight)) {
        return;
      }

      recovered.push({ ...candidate, recoveredGridCell: true });
    });
  });

  return recovered;
}

function recoverMissingUpperPhoneRow(mask, padding, imageWidth, imageHeight, boxes) {
  if (boxes.length < 2 || boxes.length > 4) {
    return boxes;
  }

  const phoneBoxes = boxes.filter((box) => isPhoneLikeSlice(box, imageWidth, imageHeight));
  if (phoneBoxes.length !== boxes.length) {
    return boxes;
  }

  const medianHeight = medianValue(phoneBoxes.map((box) => box.h));
  const medianWidth = medianValue(phoneBoxes.map((box) => box.w));
  const rowCenter = phoneBoxes.reduce((total, box) => total + boxCenterY(box), 0) / phoneBoxes.length;
  const sameLowerRow =
    rowCenter >= imageHeight * 0.64 &&
    phoneBoxes.every((box) => Math.abs(boxCenterY(box) - rowCenter) <= medianHeight * 0.2);
  if (!sameLowerRow) {
    return boxes;
  }

  const columns = [...phoneBoxes].sort((a, b) => boxCenterX(a) - boxCenterX(b));
  const splitY = Math.max(1, Math.min(...phoneBoxes.map((box) => box.y)));
  const recoveredTopRow = columns.map((column, columnIndex) => {
    const previous = columns[columnIndex - 1];
    const next = columns[columnIndex + 1];
    const leftLimit = previous ? Math.floor((boxCenterX(previous) + boxCenterX(column)) / 2) : 0;
    const rightLimit = next ? Math.ceil((boxCenterX(column) + boxCenterX(next)) / 2) : imageWidth;
    let minX = rightLimit;
    let maxX = leftLimit;
    let minY = splitY;
    let maxY = 0;
    let pixelCount = 0;

    for (let y = 0; y < splitY; y += 1) {
      const rowOffset = y * imageWidth;
      for (let x = leftLimit; x < rightLimit; x += 1) {
        if (!mask[rowOffset + x]) {
          continue;
        }
        pixelCount += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    if (!pixelCount || minX > maxX || minY > maxY) {
      return null;
    }

    const candidate = expandBox(
      { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      padding,
      imageWidth,
      imageHeight,
    );
    const similarSize =
      candidate.w >= medianWidth * 0.68 &&
      candidate.w <= medianWidth * 1.35 &&
      candidate.h >= medianHeight * 0.68 &&
      candidate.h <= medianHeight * 1.35;
    const enoughContent = pixelCount >= Math.max(5000, candidate.w * candidate.h * 0.012);

    return similarSize && enoughContent && isPhoneLikeSlice(candidate, imageWidth, imageHeight)
      ? { ...candidate, recoveredUpperGridCell: true }
      : null;
  }).filter(Boolean);

  return recoveredTopRow.length === columns.length ? [...boxes, ...recoveredTopRow] : boxes;
}

function boxHasVisibleContent(box, data, background, imageWidth, imageHeight) {
    const left = clamp(Math.floor(box.x), 0, imageWidth);
    const top = clamp(Math.floor(box.y), 0, imageHeight);
    const right = clamp(Math.ceil(box.x + box.w), left, imageWidth);
    const bottom = clamp(Math.ceil(box.y + box.h), top, imageHeight);

    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const dataIndex = (y * imageWidth + x) * 4;
        if (
          Math.abs(data[dataIndex] - background[0]) > 3 ||
          Math.abs(data[dataIndex + 1] - background[1]) > 3 ||
          Math.abs(data[dataIndex + 2] - background[2]) > 3 ||
          Math.abs(data[dataIndex + 3] - background[3]) > 3
        ) {
          return true;
        }
      }
    }

    return false;
}

function removeCompletelyBlankRecoveryBoxes(boxes, data, background, imageWidth, imageHeight) {
  return boxes.filter((box) => {
    const isRecoveryCandidate =
      box.syntheticGridBox ||
      box.recoveredGridCell ||
      box.recoveredSparseCell ||
      box.recoveredUpperGridCell;
    if (!isRecoveryCandidate) {
      return true;
    }

    return boxHasVisibleContent(box, data, background, imageWidth, imageHeight);
  });
}

function detectPhoneGridSlices(mask, padding, imageWidth, imageHeight, recoveryMask = mask) {
  if (!mask) {
    return [];
  }

  const columns = detectProjectionColumnRuns(mask, imageWidth, imageHeight);
  if (columns.length < 2) {
    return [];
  }

  const boxes = [];
  const columnCenters = getProjectionColumnCenters(columns);
  columns.forEach((column, index) => {
    const previous = columns[index - 1];
    const next = columns[index + 1];
    const leftLimit = previous ? Math.floor((columnCenters[index - 1] + columnCenters[index]) / 2) : 0;
    const rightLimit = next ? Math.ceil((columnCenters[index] + columnCenters[index + 1]) / 2) : imageWidth;
    const rowCounts = new Uint32Array(imageHeight);

    for (let y = 0; y < imageHeight; y += 1) {
      let count = 0;
      for (let x = leftLimit; x < rightLimit; x += 1) {
        if (mask[y * imageWidth + x]) {
          count += 1;
        }
      }
      rowCounts[y] = count;
    }

    const threshold = Math.max(12, (rightLimit - leftLimit) * 0.018);
    const minRunHeight = Math.max(360, imageHeight * 0.18);
    const maxInternalGap = Math.max(24, imageHeight * 0.018);
    const activeRows = new Uint8Array(imageHeight);
    let start = -1;

    for (let y = 0; y < imageHeight; y += 1) {
      if (rowCounts[y] >= threshold) {
        activeRows[y] = 1;
      }
    }

    let gapStart = -1;
    for (let y = 0; y < imageHeight; y += 1) {
      if (activeRows[y]) {
        if (gapStart >= 0 && y - gapStart <= maxInternalGap) {
          activeRows.fill(1, gapStart, y);
        }
        gapStart = -1;
      } else if (gapStart < 0) {
        gapStart = y;
      }
    }

    for (let y = 0; y < imageHeight; y += 1) {
      if (activeRows[y]) {
        if (start < 0) {
          start = y;
        }
      } else if (start >= 0) {
        pushPhoneGridRun(start, y - 1);
        start = -1;
      }
    }

    if (start >= 0) {
      pushPhoneGridRun(start, imageHeight - 1);
    }

    function pushPhoneGridRun(top, bottom) {
      if (bottom - top + 1 < minRunHeight) {
        return;
      }

      let minX = rightLimit;
      let maxX = leftLimit;
      let minY = bottom;
      let maxY = top;

      for (let y = top; y <= bottom; y += 1) {
        for (let x = leftLimit; x < rightLimit; x += 1) {
          if (!mask[y * imageWidth + x]) {
            continue;
          }
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }

      if (minX >= maxX || minY >= maxY) {
        return;
      }

      const box = expandBox(
        { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        padding,
        imageWidth,
        imageHeight,
      );

      if (isPhoneLikeSlice(box, imageWidth, imageHeight)) {
        boxes.push(box);
      }
    }
  });

  return sortSnakeReadingOrder(
    recoverMissingPhoneGridCells(
      recoveryMask,
      padding,
      imageWidth,
      imageHeight,
      columns,
      boxes,
    ),
  );
}

function detectColumnSlices(components, padding, imageWidth, imageHeight, mask) {
  const projectionColumns = detectProjectionColumns(mask, padding, imageWidth, imageHeight);
  if (projectionColumns.length >= 2) {
    return projectionColumns;
  }

  const minColumnHeight = imageHeight * 0.45;
  const minColumnWidth = imageWidth * 0.12;
  const tallBoxes = components
    .filter((box) => box.h >= minColumnHeight && box.w >= minColumnWidth)
    .sort((a, b) => a.x - b.x);

  if (tallBoxes.length < 2) {
    return [];
  }

  const mergedColumns = [];
  tallBoxes.forEach((box) => {
    const existing = mergedColumns.find((column) => {
      const overlap = getHorizontalOverlap(column, box);
      return overlap / Math.max(1, Math.min(column.w, box.w)) > 0.35;
    });

    if (existing) {
      Object.assign(existing, unionBox(existing, box, imageWidth, imageHeight));
    } else {
      mergedColumns.push({ ...box });
    }
  });

  const columns = mergedColumns
    .filter((box) => box.h >= minColumnHeight && box.w >= minColumnWidth)
    .sort((a, b) => a.x - b.x);

  if (columns.length < 2) {
    return [];
  }

  return columns.map((column, index) => {
    const previous = columns[index - 1];
    const next = columns[index + 1];
    const leftLimit = previous ? Math.floor((previous.x + previous.w + column.x) / 2) : 0;
    const rightLimit = next ? Math.ceil((column.x + column.w + next.x) / 2) : imageWidth;
    let grouped = { ...column };

    components.forEach((component) => {
      if (component === column) {
        return;
      }

      const centerX = boxCenterX(component);
      const verticalOverlap = getVerticalOverlap(component, column);
      const nearColumnY = component.y + component.h >= column.y - padding * 4 && component.y <= column.y + column.h + padding * 4;
      const inColumnBand = centerX >= leftLimit && centerX <= rightLimit;
      const overlapsColumn = getHorizontalOverlap(component, column) > 0 && verticalOverlap > 0;

      if (nearColumnY && (inColumnBand || overlapsColumn)) {
        grouped = unionBox(grouped, component, imageWidth, imageHeight);
      }
    });

    const bounded = {
      x: Math.max(grouped.x, leftLimit),
      y: grouped.y,
      w: Math.min(grouped.x + grouped.w, rightLimit) - Math.max(grouped.x, leftLimit),
      h: grouped.h,
    };

    return expandBox(bounded, padding, imageWidth, imageHeight);
  });
}

function detectProjectionColumns(mask, padding, imageWidth, imageHeight) {
  if (!mask) {
    return [];
  }

  const runs = detectProjectionColumnRuns(mask, imageWidth, imageHeight);
  if (runs.length < 2) {
    return [];
  }

  const runCenters = getProjectionColumnCenters(runs);
  return runs.map((run, index) => {
    const previous = runs[index - 1];
    const next = runs[index + 1];
    const leftLimit = previous ? Math.floor((runCenters[index - 1] + runCenters[index]) / 2) : 0;
    const rightLimit = next ? Math.ceil((runCenters[index] + runCenters[index + 1]) / 2) : imageWidth;
    let minX = rightLimit;
    let maxX = leftLimit;
    let minY = imageHeight;
    let maxY = 0;

    for (let y = 0; y < imageHeight; y += 1) {
      for (let x = leftLimit; x < rightLimit; x += 1) {
        if (mask[y * imageWidth + x]) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (minY === imageHeight) {
      minX = leftLimit;
      maxX = rightLimit - 1;
      minY = 0;
      maxY = imageHeight - 1;
    }

    return expandBox(
      { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      padding,
      imageWidth,
      imageHeight,
    );
  });
}

function detectProjectionColumnRuns(mask, imageWidth, imageHeight) {
  const columnCounts = new Uint32Array(imageWidth);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel]) {
      columnCounts[pixel % imageWidth] += 1;
    }
  }

  const radius = clamp(Math.round(imageWidth * 0.008), 8, 24);
  const smoothed = new Float64Array(imageWidth);
  let windowSum = 0;
  let windowCount = 0;
  let maxDensity = 0;

  for (let x = 0; x < imageWidth; x += 1) {
    windowSum = 0;
    windowCount = 0;
    for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(imageWidth - 1, x + radius); sampleX += 1) {
      windowSum += columnCounts[sampleX];
      windowCount += 1;
    }
    smoothed[x] = windowSum / windowCount;
    maxDensity = Math.max(maxDensity, smoothed[x]);
  }

  const threshold = Math.max(24, maxDensity * 0.06);
  const minWidth = Math.max(120, imageWidth * 0.12);
  const runs = [];
  let start = -1;

  for (let x = 0; x < imageWidth; x += 1) {
    if (smoothed[x] >= threshold) {
      if (start < 0) {
        start = x;
      }
    } else if (start >= 0) {
      if (x - start >= minWidth) {
        runs.push({ x: start, w: x - start });
      }
      start = -1;
    }
  }

  if (start >= 0 && imageWidth - start >= minWidth) {
    runs.push({ x: start, w: imageWidth - start });
  }

  return runs;
}

function getSeparatedSpans(counts) {
  const first = counts.findIndex((count) => count > 0);
  if (first < 0) {
    return [];
  }

  let last = counts.length;
  while (!counts[last - 1]) {
    last -= 1;
  }

  const minGap = Math.max(4, Math.ceil(counts.length * 0.012));
  const gaps = findBlankBands(counts, minGap)
    .filter(({ start, end }) => start > first && end < last);
  const starts = [first, ...gaps.map(({ end }) => end)];
  const ends = [...gaps.map(({ start }) => start), last];
  const limits = [0, ...gaps.map(({ start, end }) => Math.round((start + end) / 2)), counts.length];

  return starts.map((start, index) => ({
    start,
    end: ends[index],
    lowerLimit: limits[index],
    upperLimit: limits[index + 1],
  }));
}

function detectFourImageGrid(mask, width, height, padding) {
  const rowCounts = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rowCounts[y] += mask[y * width + x];
    }
  }

  const rows = getSeparatedSpans(rowCounts);
  if (rows.length !== 2 || rows.some((row) => row.end - row.start < height * 0.2)) {
    return [];
  }

  const cells = [];
  for (const row of rows) {
    const columnCounts = new Uint32Array(width);
    for (let y = row.start; y < row.end; y += 1) {
      for (let x = 0; x < width; x += 1) {
        columnCounts[x] += mask[y * width + x];
      }
    }

    const columns = getSeparatedSpans(columnCounts);
    if (columns.length < 1 || columns.length > 3 ||
        columns.some((column) => column.end - column.start < width * 0.13)) {
      return [];
    }
    for (const column of columns) {
      const box = cropMaskBand(mask, 0, width, height, column.start, column.end, row.start, row.end);
      if (!box || box.h < height * 0.2) {
        return [];
      }
      cells.push({ box, row, column });
    }
  }

  if (cells.length !== 4) {
    return [];
  }
  const widths = cells.map(({ box }) => box.w);
  const heights = cells.map(({ box }) => box.h);
  if (Math.max(...widths) > Math.min(...widths) * 1.4 ||
      Math.max(...heights) > Math.min(...heights) * 1.4) {
    return [];
  }

  // Limit padding to each cell's side of the gutter so neighboring content cannot leak in.
  return cells.map(({ box, row, column }) => {
    const x = Math.max(box.x - padding, column.lowerLimit);
    const y = Math.max(box.y - padding, row.lowerLimit);
    const right = Math.min(box.x + box.w + padding, column.upperLimit);
    const bottom = Math.min(box.y + box.h + padding, row.upperLimit);
    return { x, y, w: right - x, h: bottom - y, fourImageGrid: true };
  });
}

function autoDetectSlices() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const alphaThreshold = numberValue(els.alphaThreshold, 12);
  const tolerance = numberValue(els.colorTolerance, 24);
  const minArea = numberValue(els.minArea, 64);
  const mergeGap = numberValue(els.mergeGap, 4);
  const padding = numberValue(els.padding, 0);
  const detectBackground = els.detectBackground.checked;
  const background = getBackgroundColor(imageData);
  const mask = new Uint8Array(width * height);
  const useSoftRecoveryMask = mask.length <= 24_000_000 && tolerance > 8;
  const recoveryMask = useSoftRecoveryMask ? new Uint8Array(mask.length) : mask;
  const recoveryTolerance = Math.max(8, tolerance * 0.55);

  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const dataIndex = pixel * 4;
    const isStrictContent = isContentPixel(
      data,
      dataIndex,
      background,
      alphaThreshold,
      tolerance,
      detectBackground,
    );
    if (isStrictContent) {
      mask[pixel] = 1;
    }
    if (
      recoveryMask !== mask &&
      (isStrictContent || isContentPixel(
        data,
        dataIndex,
        background,
        alphaThreshold,
        recoveryTolerance,
        detectBackground,
      ))
    ) {
      recoveryMask[pixel] = 1;
    }
  }

  const transitionArrows = removeTransitionArrows(mask, data, width, height);
  if (recoveryMask !== mask) {
    removeTransitionArrows(recoveryMask, data, width, height);
  }

  if (!transitionArrows.length) {
    const fourImageGrid = detectFourImageGrid(recoveryMask, width, height, padding);
    if (fourImageGrid.length) {
      return sortSnakeReadingOrder(fourImageGrid).map(createSlice);
    }
  }

  const visited = new Uint8Array(mask.length);
  const components = [];
  const stack = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) {
      continue;
    }

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    stack.push(start);
    visited[start] = 1;

    while (stack.length) {
      const current = stack.pop();
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      addNeighbor(current - 1, x > 0);
      addNeighbor(current + 1, x < width - 1);
      addNeighbor(current - width, y > 0);
      addNeighbor(current + width, y < height - 1);
    }

    if (area >= minArea) {
      const rawBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      components.push({ ...rawBox, area });
    }
  }

  const groupedBoxes = groupTitlesWithImages(
    components,
    padding,
    mergeGap,
    width,
    height,
    mask,
    recoveryMask,
  );
  const arrowCompletedBoxes = transitionArrows.length
    ? recoverIncompletePhoneGrid(mask, padding, width, height, groupedBoxes)
    : groupedBoxes;
  const completedBoxes = recoverMissingUpperPhoneRow(
    recoveryMask,
    padding,
    width,
    height,
    arrowCompletedBoxes,
  );
  const nonBlankBoxes = removeCompletelyBlankRecoveryBoxes(
    completedBoxes,
    data,
    background,
    width,
    height,
  );
  const preparedBoxes = prepareSafeSliceOutputs(
    nonBlankBoxes,
    transitionArrows,
    padding,
    width,
    height,
  );
  return sortSnakeReadingOrder(preparedBoxes)
    .map((box, index) => createSlice(box, index));

  function addNeighbor(index, allowed) {
    if (allowed && mask[index] && !visited[index]) {
      visited[index] = 1;
      stack.push(index);
    }
  }
}

function readingOrderSort(a, b) {
  const rowTolerance = Math.max(8, Math.min(a.h, b.h) * 0.5);
  const sameRow = Math.abs(a.y - b.y) <= rowTolerance;
  return sameRow ? a.x - b.x : a.y - b.y;
}

function sortSnakeReadingOrder(boxes) {
  if (boxes.length <= 1) {
    return [...boxes];
  }

  const heights = boxes.map((box) => box.h).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];
  const rowTolerance = Math.max(40, medianHeight * 0.42);
  const rows = [];

  [...boxes]
    .sort((a, b) => {
      const centerDiff = boxCenterY(a) - boxCenterY(b);
      return Math.abs(centerDiff) > rowTolerance ? centerDiff : a.x - b.x;
    })
    .forEach((box) => {
      const centerY = boxCenterY(box);
      const row = rows.find((items) => Math.abs(items.centerY - centerY) <= rowTolerance);

      if (row) {
        row.items.push(box);
        row.centerY = row.items.reduce((total, item) => total + boxCenterY(item), 0) / row.items.length;
      } else {
        rows.push({ centerY, items: [box] });
      }
    });

  return rows
    .sort((a, b) => a.centerY - b.centerY)
    .flatMap((row, rowIndex) => {
      const direction = rowIndex % 2 === 0 ? 1 : -1;
      return [...row.items].sort((a, b) => direction * (a.x - b.x));
    });
}

function expandBox(box, padding, maxWidth, maxHeight) {
  const x = clamp(box.x - padding, 0, maxWidth);
  const y = clamp(box.y - padding, 0, maxHeight);
  const right = clamp(box.x + box.w + padding, 0, maxWidth);
  const bottom = clamp(box.y + box.h + padding, 0, maxHeight);
  return {
    x,
    y,
    w: Math.max(1, right - x),
    h: Math.max(1, bottom - y),
  };
}

function boxesTouch(a, b, gap) {
  return !(
    a.x + a.w + gap < b.x ||
    b.x + b.w + gap < a.x ||
    a.y + a.h + gap < b.y ||
    b.y + b.h + gap < a.y
  );
}

function unionBox(a, b, maxWidth, maxHeight) {
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  const right = Math.min(maxWidth, Math.max(a.x + a.w, b.x + b.w));
  const bottom = Math.min(maxHeight, Math.max(a.y + a.h, b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

function mergeBoxes(inputBoxes, gap, maxWidth, maxHeight) {
  const boxes = [...inputBoxes];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (boxesTouch(boxes[i], boxes[j], gap)) {
          boxes[i] = unionBox(boxes[i], boxes[j], maxWidth, maxHeight);
          boxes.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) {
        break;
      }
    }
  }

  return boxes;
}

function createSlice(box, index) {
  const source = activeSourceRecord;
  return {
    ...box,
    index,
    source,
    imageId: source?.id || "",
    name: buildSliceName(index, source?.fileName),
  };
}

function drawPreview() {
  const image = activeSourceRecord || images[0];
  if (!image) {
    return;
  }

  const previewSlices = getPreviewSlices(image);
  const previewGap = 52;
  const previewPadding = 34;
  const previewWidth = previewSlices.length
    ? previewSlices.reduce((total, slice) => total + slice.w, 0) + previewGap * Math.max(0, previewSlices.length - 1) + previewPadding * 2
    : 320;
  const previewHeight = previewSlices.length
    ? Math.max(...previewSlices.map((slice) => slice.h)) + previewPadding * 2
    : 320;
  els.emptyState.classList.add("is-hidden");
  els.imageMeta.textContent = `${image.displayName} · ${image.width} × ${image.height}px · 队列 ${images.length} 张`;
  const wrap = els.previewCanvas.parentElement;
  const rawAvailableWidth = Math.max(320, wrap.clientWidth);
  const rawAvailableHeight = Math.max(320, wrap.clientHeight);
  const availableWidth = Math.max(320, rawAvailableWidth - 20);
  const availableHeight = Math.max(320, rawAvailableHeight - 20);
  const isSingleSlicePreview = previewSlices.length === 1;
  const framePad = isSingleSlicePreview ? 2 : 10;
  let displayWidth = 1;
  let displayHeight = 1;
  let previewItems = [];

  if (isSingleSlicePreview) {
    const slice = previewSlices[0];
    displayWidth = Math.round(rawAvailableWidth);
    displayHeight = Math.round(Math.max(360, rawAvailableHeight));
    const maxSliceWidth = Math.max(120, displayWidth - framePad * 2);
    const maxSliceHeight = Math.max(120, displayHeight - framePad * 2);
    const itemScale = Math.min(maxSliceWidth / slice.w, maxSliceHeight / slice.h);
    const w = Math.max(1, Math.round(slice.w * itemScale));
    const h = Math.max(1, Math.round(slice.h * itemScale));

    previewItems = [
      {
        slice,
        x: Math.round((displayWidth - w) / 2),
        y: Math.round((displayHeight - h) / 2),
        w,
        h,
        scale: itemScale,
      },
    ];
  } else {
    const scale = Math.min(1, availableWidth / previewWidth);
    displayWidth = Math.max(1, Math.round(previewWidth * scale));
    displayHeight = Math.max(1, Math.round(previewHeight * scale));
    let cursorX = previewPadding;
    previewItems = previewSlices.map((slice) => {
      const item = {
        slice,
        x: Math.round(cursorX * scale),
        y: Math.round(previewPadding * scale),
        w: Math.round(slice.w * scale),
        h: Math.round(slice.h * scale),
        scale,
      };
      cursorX += slice.w + previewGap;
      return item;
    });
  }

  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const canvasWidth = Math.max(1, Math.round(displayWidth * pixelRatio));
  const canvasHeight = Math.max(1, Math.round(displayHeight * pixelRatio));

  els.previewCanvas.width = canvasWidth;
  els.previewCanvas.height = canvasHeight;
  els.previewCanvas.style.width = `${displayWidth}px`;
  els.previewCanvas.style.height = `${displayHeight}px`;
  previewCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  previewCtx.clearRect(0, 0, displayWidth, displayHeight);
  previewCtx.imageSmoothingEnabled = previewItems.some((item) => item.scale !== 1);
  previewCtx.imageSmoothingQuality = "high";
  previewCtx.lineWidth = 2;
  const guideColor = getComputedStyle(els.previewCanvas).getPropertyValue("--slice-guide").trim();
  previewCtx.font = "700 14px sans-serif";

  previewItems.forEach(({ slice, x, y, w, h }) => {
    const frameX = Math.max(0, x - framePad);
    const frameY = Math.max(0, y - framePad);
    const frameW = Math.min(displayWidth - frameX, w + framePad * 2);
    const frameH = Math.min(displayHeight - frameY, h + framePad * 2);
    previewCtx.fillStyle = "#ffffff";
    previewCtx.fillRect(frameX, frameY, frameW, frameH);
    previewCtx.strokeStyle = guideColor;
    previewCtx.lineWidth = isSingleSlicePreview ? 4 : 3;
    previewCtx.strokeRect(frameX + 1, frameY + 1, Math.max(1, frameW - 2), Math.max(1, frameH - 2));
    if (els.backgroundMode.value === "white") {
      previewCtx.fillStyle = "#ffffff";
      previewCtx.fillRect(x, y, w, h);
    }
    const renderedSlice = renderSliceCanvas(slice, "png");
    previewCtx.drawImage(renderedSlice, 0, 0, renderedSlice.width, renderedSlice.height, x, y, w, h);
    previewCtx.fillStyle = guideColor;
    previewCtx.fillText(String(slice.index + 1), frameX + 4, Math.max(18, frameY - 8));
  });

  if (hasRunBatch) {
    const currentModeText = image.slices[0]?.fullImageOutput ? "整图输出" : `${image.slices.length} 张切片`;
    els.sliceMeta.textContent = slices.length
      ? `已生成 ${slices.length} 个输出，当前预览 ${image.displayName}，${currentModeText}`
      : "未识别到可切区域";
  } else {
    els.sliceMeta.textContent = previewSlices.length
      ? `已预览切图效果，队列 ${images.length} 张，等待确认导出`
      : "未识别到可切区域";
  }
  renderPreviewLinks(previewItems, displayWidth, displayHeight);
}

function renderThumbs() {
  els.thumbGrid.innerHTML = "";
  els.resultCount.textContent = String(slices.length);
  els.thumbGrid.classList.toggle("is-empty", !slices.length);

  if (!slices.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  slices.forEach((slice) => {
    const item = document.createElement("div");
    const mediaLink = document.createElement("a");
    const img = document.createElement("img");
    const label = document.createElement("span");
    const saveButton = document.createElement("button");
    const fileName = getExportFileName(slice);
    const dataUrl = renderSliceDataUrl(slice, els.exportFormat.value);
    item.className = "thumb";
    mediaLink.className = "thumb-media";
    mediaLink.href = dataUrl;
    mediaLink.download = fileName;
    mediaLink.title = `点击放大查看，双击自动保存 ${fileName}`;
    let openTimer = null;
    mediaLink.addEventListener("click", (event) => {
      event.preventDefault();
      window.clearTimeout(openTimer);
      openTimer = window.setTimeout(() => openSliceViewer(slice, slices), 180);
    });
    mediaLink.addEventListener("dblclick", (event) => {
      event.preventDefault();
      window.clearTimeout(openTimer);
      autoDownloadSlice(slice, saveButton);
    });
    img.src = dataUrl;
    img.alt = fileName;
    label.textContent = `${fileName} · ${slice.w}×${slice.h}`;
    saveButton.className = "save-button";
    saveButton.type = "button";
    saveButton.textContent = "另存为";
    saveButton.addEventListener("click", () => saveSliceAs(slice, saveButton));
    mediaLink.append(img);
    item.append(mediaLink, label, saveButton);
    fragment.append(item);
  });
  els.thumbGrid.append(fragment);
}

function renderPreviewLinks(previewItems, displayWidth, displayHeight) {
  releasePreviewObjectUrls();
  els.previewLinks.innerHTML = "";
  els.previewLinks.style.width = `${displayWidth}px`;
  els.previewLinks.style.height = `${displayHeight}px`;

  const image = activeSourceRecord || images[0];
  if (!image || !previewItems.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const previewSlices = previewItems.map((item) => item.slice);

  previewItems.forEach(({ slice, x, y, w, h }) => {
    const link = document.createElement("a");
    const fileName = getExportFileName(slice);
    const url = createSliceObjectUrl(slice);
    link.className = "preview-save-link";
    link.href = url;
    link.download = fileName;
    link.title = `点击放大查看 ${fileName}`;
    link.dataset.objectUrl = url;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openSliceViewer(slice, previewSlices);
    });
    link.addEventListener("dblclick", (event) => {
      event.preventDefault();
    });
    link.style.left = `${x}px`;
    link.style.top = `${y}px`;
    link.style.width = `${w}px`;
    link.style.height = `${h}px`;
    fragment.append(link);
  });

  els.previewLinks.append(fragment);
}

function renderSliceCanvas(slice, format) {
  const source = slice.source || activeSourceRecord;
  const sourceImageCanvas = source?.canvas || sourceCanvas;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = slice.w;
  canvas.height = slice.h;

  if (format === "jpeg" || els.backgroundMode.value === "white" || slice.forceWhiteCanvas) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.w, slice.h);
  }

  const sourceX = slice.sourceX ?? slice.x;
  const sourceY = slice.sourceY ?? slice.y;
  const sourceW = slice.sourceW ?? slice.w;
  const sourceH = slice.sourceH ?? slice.h;
  const drawOffsetX = slice.drawOffsetX ?? 0;
  const drawOffsetY = slice.drawOffsetY ?? 0;
  ctx.drawImage(
    sourceImageCanvas,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    drawOffsetX,
    drawOffsetY,
    sourceW,
    sourceH,
  );

  if (slice.redactions?.length) {
    ctx.fillStyle = "#ffffff";
    slice.redactions.forEach((redaction) => {
      ctx.fillRect(redaction.x, redaction.y, redaction.w, redaction.h);
    });
  }
  return canvas;
}

function renderSliceDataUrl(slice, format) {
  const canvas = renderSliceCanvas(slice, format);
  return canvas.toDataURL(`image/${format}`, 0.92);
}

function canvasToBlob(canvas, format) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), `image/${format}`, 0.92);
  });
}

function createSliceBlob(slice) {
  const format = els.exportFormat.value;
  const dataUrl = renderSliceDataUrl(slice, format);
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || `image/${format}`;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

function createSliceObjectUrl(slice) {
  return URL.createObjectURL(createSliceBlob(slice));
}

function closeSliceViewer() {
  if (activeLightboxUrl) {
    URL.revokeObjectURL(activeLightboxUrl);
    activeLightboxUrl = "";
  }

  els.sliceLightbox.classList.add("is-hidden");
  els.lightboxImage.removeAttribute("src");
  els.lightboxImage.alt = "";
  els.lightboxCaption.textContent = "";
  lightboxSlices = [];
  lightboxIndex = 0;
  document.body.classList.remove("has-lightbox");
}

function setLightboxSlice(index) {
  if (!lightboxSlices.length) {
    return;
  }

  lightboxIndex = (index + lightboxSlices.length) % lightboxSlices.length;

  if (activeLightboxUrl) {
    URL.revokeObjectURL(activeLightboxUrl);
  }

  const slice = lightboxSlices[lightboxIndex];
  const fileName = getExportFileName(slice);
  activeLightboxUrl = createSliceObjectUrl(slice);
  els.lightboxImage.src = activeLightboxUrl;
  els.lightboxImage.alt = fileName;
  els.lightboxCaption.textContent = `${lightboxIndex + 1}/${lightboxSlices.length} · ${fileName} · ${slice.w}×${slice.h}`;
}

function openSliceViewer(slice, group = []) {
  if (!slice) {
    return;
  }

  lightboxSlices = group.length ? [...group] : [slice];
  const startIndex = Math.max(0, lightboxSlices.findIndex((item) => item === slice));
  setLightboxSlice(startIndex);
  els.sliceLightbox.classList.remove("is-hidden");
  document.body.classList.add("has-lightbox");
}

function showPreviousLightboxSlice() {
  setLightboxSlice(lightboxIndex - 1);
}

function showNextLightboxSlice() {
  setLightboxSlice(lightboxIndex + 1);
}

function releasePreviewObjectUrls() {
  els.previewLinks.querySelectorAll("[data-object-url]").forEach((link) => {
    URL.revokeObjectURL(link.dataset.objectUrl);
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function saveBlobAs(blob, fileName) {
  if (window.showSaveFilePicker) {
    try {
      const extension = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "图片文件",
            accept: { [blob.type || "image/png"]: extension ? [extension] : [".png"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      console.warn("保存对话框不可用，已改用浏览器下载。", error);
    }
  }

  downloadBlob(blob, fileName);
}

function setSaveButtonBusy(button, isBusy) {
  if (!button || !button.isConnected) {
    return;
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? "保存中..." : "另存为";
}

async function runSliceSave(slice, button, saveAction) {
  const fileName = getExportFileName(slice);
  if (activeSliceSaves.has(fileName)) {
    return;
  }

  activeSliceSaves.add(fileName);
  setSaveButtonBusy(button, true);

  try {
    await saveAction(createSliceBlob(slice), fileName);
  } finally {
    window.setTimeout(() => {
      activeSliceSaves.delete(fileName);
      setSaveButtonBusy(button, false);
    }, 900);
  }
}

async function autoDownloadSlice(slice, button) {
  await runSliceSave(slice, button, downloadBlob);
}

async function saveSliceAs(slice, button) {
  await runSliceSave(slice, button, saveBlobAs);
}

async function blobToUint8Array(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function stringToUint8Array(value) {
  return new TextEncoder().encode(value);
}

function dateToDosTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosTime, dosDate };
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

const crc32Table = makeCrc32Table();

function crc32(bytes) {
  let value = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    value = crc32Table[(value ^ bytes[i]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createZipBlob(files) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const { dosTime, dosDate } = dateToDosTime(new Date());

  const pushChunk = (chunk) => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  files.forEach((file) => {
    const nameBytes = stringToUint8Array(file.name);
    const bytes = file.bytes;
    const checksum = crc32(bytes);
    const localOffset = offset;
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    pushChunk(localHeader);
    pushChunk(bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);
  });

  const centralOffset = offset;
  centralDirectory.forEach(pushChunk);
  const centralSize = offset - centralOffset;
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  chunks.push(endRecord);
  return new Blob(chunks, { type: "application/zip" });
}

async function downloadZip() {
  if (!slices.length || !images.length || isProcessing) {
    return;
  }

  els.downloadBtn.disabled = true;
  els.downloadBtn.textContent = "打包中...";
  const zipFiles = [];

  try {
    for (const slice of slices) {
      const blob = createSliceBlob(slice);
      const fileName = getExportFileName(slice);
      zipFiles.push({ name: fileName, bytes: await blobToUint8Array(blob) });
    }

    const zipBlob = createZipBlob(zipFiles);
    const zipBaseName = images.length === 1 ? getBaseName(images[0].fileName) : `batch-${images.length}-images`;
    downloadBlob(zipBlob, `${zipBaseName}-slices.zip`);
  } finally {
    els.downloadBtn.textContent = "下载 ZIP";
    updateActions();
  }
}

async function exportToFolder() {
  if (!slices.length || !images.length || isProcessing) {
    return;
  }

  if (!window.showDirectoryPicker) {
    alert("当前浏览器不支持直接导出文件夹，请使用 Edge 或 Chrome 打开。");
    return;
  }

  try {
    const parentHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const folderBase = images.length === 1
      ? `${getBaseName(images[0].fileName)}-slices`
      : `批量切图-${images.length}张原图`;
    const outputHandle = await parentHandle.getDirectoryHandle(folderBase, { create: true });
    els.exportFolderBtn.disabled = true;
    els.exportFolderBtn.textContent = "导出中...";

    for (const slice of slices) {
      const fileHandle = await outputHandle.getFileHandle(getExportFileName(slice), { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(createSliceBlob(slice));
      await writable.close();
    }

    alert(`已导出 ${slices.length} 张图片到文件夹“${folderBase}”。`);
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      alert("文件夹导出失败，请重新选择保存位置。");
    }
  } finally {
    els.exportFolderBtn.textContent = "导出文件夹";
    updateActions();
  }
}

function updateActions(sliceButtonText = "") {
  els.downloadBtn.disabled = isProcessing || !hasRunBatch || !slices.length;
  els.exportFolderBtn.disabled = isProcessing || !hasRunBatch || !slices.length;
  els.backgroundMode.disabled = isProcessing;
  els.exportFormat.disabled = isProcessing;
  els.customSliceBtn.disabled = isProcessing || !images.length;
  els.sliceBtn.disabled = isProcessing || !images.length;
  els.clearQueueBtn.disabled = isProcessing || !images.length;

  if (sliceButtonText) {
    els.sliceBtn.textContent = sliceButtonText;
  } else if (isProcessing) {
    els.sliceBtn.textContent = "处理中...";
  } else if (hasRunBatch) {
    els.sliceBtn.textContent = "重新确认切图";
  } else {
    els.sliceBtn.textContent = "确认切图";
  }
}

const debouncedMarkNeedsConfirm = debounce(markNeedsConfirm);

els.fileInput.addEventListener("change", (event) => {
  loadFiles(event.target.files);
  event.target.value = "";
});

els.folderBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  els.folderInput.click();
});

els.folderInput.addEventListener("change", (event) => {
  loadFiles(event.target.files);
  event.target.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-over");
  });
});

els.dropZone.addEventListener("drop", async (event) => {
  try {
    const droppedFiles = await getDroppedFiles(event.dataTransfer);
    if (!droppedFiles.length) {
      alert("没有找到可导入的图片，请拖入 PNG、JPG、WEBP 图片或装图片的文件夹。");
      return;
    }
    await loadFiles(droppedFiles);
  } catch (error) {
    console.error(error);
    alert("拖入读取失败，请重新拖入图片，或改用“选择文件夹”按钮。");
  }
});

[
  els.alphaThreshold,
  els.colorTolerance,
  els.minArea,
  els.mergeGap,
  els.detectBackground,
  els.groupTextLabels,
  els.textMaxHeight,
  els.padding,
].forEach((control) => {
  control.addEventListener("input", debouncedMarkNeedsConfirm);
});

[
  els.useSourceName,
  els.articleId,
  els.articleTitle,
  els.startIndex,
  els.sequenceDigits,
].filter(Boolean).forEach((control) => {
  control.addEventListener("input", refreshSliceNames);
});

els.exportFormat.addEventListener("change", () => {
  updateNamePreview();
  if (hasRunBatch) {
    runSlice();
  } else {
    drawPreview();
  }
});
els.backgroundMode.addEventListener("change", () => {
  if (hasRunBatch) {
    runSlice();
  } else {
    drawPreview();
  }
});
els.alphaThreshold.addEventListener("input", () => {
  els.alphaOutput.textContent = els.alphaThreshold.value;
});
els.colorTolerance.addEventListener("input", () => {
  els.toleranceOutput.textContent = els.colorTolerance.value;
});
els.sliceBtn.addEventListener("click", runSlice);
els.customSliceBtn.addEventListener("click", openCustomSliceEditor);
els.customSliceClose.addEventListener("click", closeCustomSliceEditor);
els.customSliceCancel.addEventListener("click", closeCustomSliceEditor);
els.customSliceApply.addEventListener("click", applyCustomSlices);
els.customSliceRestore.addEventListener("click", restoreCustomSliceToAuto);
els.customGridReset.addEventListener("click", resetCustomGrid);
els.customAddHorizontal.addEventListener("click", () => addCustomGuide("horizontal"));
els.customAddVertical.addEventListener("click", () => addCustomGuide("vertical"));
els.customDeleteGuide.addEventListener("click", deleteSelectedCustomGuide);
els.customClearGuides.addEventListener("click", clearCustomGuides);
els.customSliceImage.addEventListener("load", () => {
  requestAnimationFrame(positionCustomGrid);
});
els.resetBtn.addEventListener("click", resetTool);
els.clearQueueBtn.addEventListener("click", clearQueue);
els.downloadBtn.addEventListener("click", downloadZip);
els.exportFolderBtn.addEventListener("click", exportToFolder);
els.lightboxClose.addEventListener("click", closeSliceViewer);
els.sliceLightbox.addEventListener("click", (event) => {
  if (event.target === els.sliceLightbox) {
    closeSliceViewer();
  }
});
window.addEventListener("keydown", (event) => {
  if (!els.customSliceModal.classList.contains("is-hidden")) {
    if (event.key === "Escape") {
      closeCustomSliceEditor();
    }
    return;
  }

  if (els.sliceLightbox.classList.contains("is-hidden")) {
    return;
  }

  if (event.key === "Escape") {
    closeSliceViewer();
  } else if (event.key === "ArrowLeft") {
    showPreviousLightboxSlice();
  } else if (event.key === "ArrowRight") {
    showNextLightboxSlice();
  }
});
window.addEventListener("resize", debounce(drawPreview, 120));
window.addEventListener("resize", debounce(positionCustomGrid, 120));

resetTool();
