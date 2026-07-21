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

  if (hasRunBatch && image.slices.length) {
    return image.slices;
  }

  setActiveImage(image);
  return autoSlicesOrOriginal(image).map((slice, index) => ({
    ...slice,
    index,
    source: image,
    imageId: image.id,
    name: buildSliceName(index, image.fileName),
  }));
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

function buildFiveLayoutMask() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const background = getBackgroundColor(imageData);
  const alphaThreshold = numberValue(els.alphaThreshold, 12);
  const tolerance = numberValue(els.colorTolerance, 24);
  const detectBackground = els.detectBackground.checked;
  const mask = new Uint8Array(width * height);

  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (isContentPixel(imageData.data, pixel * 4, background, alphaThreshold, tolerance, detectBackground)) {
      mask[pixel] = 1;
    }
  }

  return mask;
}

function findFiveLayoutRowSplit(mask, width, height) {
  const rowCounts = new Uint32Array(height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel]) {
      rowCounts[Math.floor(pixel / width)] += 1;
    }
  }

  const searchStart = Math.floor(height * 0.32);
  const searchEnd = Math.ceil(height * 0.68);
  const lowThreshold = Math.max(3, Math.round(width * 0.0025));
  const candidates = [];
  let start = -1;

  for (let y = searchStart; y <= searchEnd; y += 1) {
    if (rowCounts[y] <= lowThreshold) {
      if (start < 0) {
        start = y;
      }
    } else if (start >= 0) {
      candidates.push({ start, end: y - 1 });
      start = -1;
    }
  }
  if (start >= 0) {
    candidates.push({ start, end: searchEnd });
  }

  const center = height / 2;
  const best = candidates
    .filter((run) => run.end - run.start + 1 >= Math.max(8, height * 0.005))
    .sort((a, b) => {
      const aLength = a.end - a.start + 1;
      const bLength = b.end - b.start + 1;
      const aDistance = Math.abs((a.start + a.end) / 2 - center);
      const bDistance = Math.abs((b.start + b.end) / 2 - center);
      return (bLength - bDistance * 0.08) - (aLength - aDistance * 0.08);
    })[0];

  if (best) {
    return Math.round((best.start + best.end) / 2);
  }

  let lowestY = Math.round(center);
  let lowestCount = Number.POSITIVE_INFINITY;
  for (let y = searchStart; y <= searchEnd; y += 1) {
    if (rowCounts[y] < lowestCount) {
      lowestCount = rowCounts[y];
      lowestY = y;
    }
  }
  return lowestY;
}

function detectFiveLayoutColumns(mask, width, yStart, yEnd, expectedCount) {
  const columnCounts = new Uint32Array(width);
  for (let y = yStart; y < yEnd; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[rowOffset + x]) {
        columnCounts[x] += 1;
      }
    }
  }

  const radius = clamp(Math.round(width * 0.008), 8, 24);
  const smoothed = new Float64Array(width);
  let maximum = 0;

  for (let x = 0; x < width; x += 1) {
    let total = 0;
    let samples = 0;
    for (let sample = Math.max(0, x - radius); sample <= Math.min(width - 1, x + radius); sample += 1) {
      total += columnCounts[sample];
      samples += 1;
    }
    smoothed[x] = total / samples;
    maximum = Math.max(maximum, smoothed[x]);
  }

  const threshold = Math.max(20, maximum * 0.06);
  const minimumWidth = Math.max(100, width * 0.14);
  const runs = [];
  let start = -1;

  for (let x = 0; x < width; x += 1) {
    if (smoothed[x] >= threshold) {
      if (start < 0) {
        start = x;
      }
    } else if (start >= 0) {
      if (x - start >= minimumWidth) {
        runs.push({ x: start, w: x - start });
      }
      start = -1;
    }
  }
  if (start >= 0 && width - start >= minimumWidth) {
    runs.push({ x: start, w: width - start });
  }

  if (runs.length > expectedCount) {
    return runs
      .sort((a, b) => b.w - a.w)
      .slice(0, expectedCount)
      .sort((a, b) => a.x - b.x);
  }
  return runs.sort((a, b) => a.x - b.x);
}

function cropFiveLayoutRow(mask, width, height, yStart, yEnd, runs, rowIndex) {
  const padding = numberValue(els.padding, 0);
  return runs.map((run, index) => {
    const previous = runs[index - 1];
    const next = runs[index + 1];
    const leftLimit = previous ? Math.floor((previous.x + previous.w + run.x) / 2) : 0;
    const rightLimit = next ? Math.ceil((run.x + run.w + next.x) / 2) : width;
    let minX = rightLimit;
    let maxX = leftLimit;
    let minY = yEnd;
    let maxY = yStart;

    for (let y = yStart; y < yEnd; y += 1) {
      const rowOffset = y * width;
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

    return {
      ...expandBox(
        { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        padding,
        width,
        height,
      ),
      rowIndex,
      columnIndex: index,
    };
  }).filter(Boolean);
}

function detectFiveLayoutSlices() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const mask = buildFiveLayoutMask();
  const splitY = findFiveLayoutRowSplit(mask, width, height);
  const topRuns = detectFiveLayoutColumns(mask, width, 0, splitY, 3);
  const bottomRuns = detectFiveLayoutColumns(mask, width, splitY, height, 2);

  if (topRuns.length !== 3 || bottomRuns.length !== 2) {
    return [];
  }

  const top = cropFiveLayoutRow(mask, width, height, 0, splitY, topRuns, 0);
  const bottom = cropFiveLayoutRow(mask, width, height, splitY, height, bottomRuns, 1);
  if (top.length !== 3 || bottom.length !== 2) {
    return [];
  }

  return [...top, ...[...bottom].reverse()]
    .map((box, index) => createSlice(box, index));
}

function autoSlicesOrOriginal(image) {
  const detectedSlices = detectFiveLayoutSlices();
  return detectedSlices.length === 5 ? detectedSlices : [createOriginalOutputSlice(image)];
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

function groupTitlesWithImages(components, padding, mergeGap, imageWidth, imageHeight, mask) {
  const phoneGridBoxes = detectPhoneGridSlices(mask, padding, imageWidth, imageHeight);
  const columnBoxes = detectColumnSlices(components, padding, imageWidth, imageHeight, mask);
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

function detectPhoneGridSlices(mask, padding, imageWidth, imageHeight) {
  if (!mask) {
    return [];
  }

  const columns = detectProjectionColumnRuns(mask, imageWidth, imageHeight);
  if (columns.length < 2) {
    return [];
  }

  const boxes = [];
  columns.forEach((column, index) => {
    const previous = columns[index - 1];
    const next = columns[index + 1];
    const leftLimit = previous ? Math.floor((previous.x + previous.w + column.x) / 2) : 0;
    const rightLimit = next ? Math.ceil((column.x + column.w + next.x) / 2) : imageWidth;
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

  return sortSnakeReadingOrder(boxes);
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

  return runs.map((run, index) => {
    const previous = runs[index - 1];
    const next = runs[index + 1];
    const leftLimit = previous ? Math.floor((previous.x + previous.w + run.x) / 2) : 0;
    const rightLimit = next ? Math.ceil((run.x + run.w + next.x) / 2) : imageWidth;
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

  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (isContentPixel(data, pixel * 4, background, alphaThreshold, tolerance, detectBackground)) {
      mask[pixel] = 1;
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

  return sortSnakeReadingOrder(groupTitlesWithImages(components, padding, mergeGap, width, height, mask))
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
    : image.width;
  const previewHeight = previewSlices.length
    ? Math.max(...previewSlices.map((slice) => slice.h)) + previewPadding * 2
    : image.height;
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
  previewCtx.strokeStyle = "#d88a25";
  previewCtx.font = "700 14px sans-serif";

  previewItems.forEach(({ slice, x, y, w, h }) => {
    const frameX = Math.max(0, x - framePad);
    const frameY = Math.max(0, y - framePad);
    const frameW = Math.min(displayWidth - frameX, w + framePad * 2);
    const frameH = Math.min(displayHeight - frameY, h + framePad * 2);
    previewCtx.fillStyle = "#ffffff";
    previewCtx.fillRect(frameX, frameY, frameW, frameH);
    previewCtx.strokeStyle = "#d88a25";
    previewCtx.lineWidth = isSingleSlicePreview ? 4 : 3;
    previewCtx.strokeRect(frameX + 1, frameY + 1, Math.max(1, frameW - 2), Math.max(1, frameH - 2));
    if (els.backgroundMode.value === "white") {
      previewCtx.fillStyle = "#ffffff";
      previewCtx.fillRect(x, y, w, h);
    }
    previewCtx.drawImage(image.canvas, slice.x, slice.y, slice.w, slice.h, x, y, w, h);
    previewCtx.fillStyle = "#d88a25";
    previewCtx.fillText(String(slice.index + 1), frameX + 4, Math.max(18, frameY - 8));
  });

  if (hasRunBatch) {
    const currentModeText = image.slices[0]?.fullImageOutput ? "整图输出" : `${image.slices.length} 张切片`;
    els.sliceMeta.textContent = slices.length
      ? `已生成 ${slices.length} 个输出，当前预览 ${image.displayName}，${currentModeText}`
      : "未识别到可切区域";
  } else {
    els.sliceMeta.textContent = images.length
      ? `已预览切图效果，队列 ${images.length} 张，等待确认导出`
      : "等待切图";
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

  if (format === "jpeg" || els.backgroundMode.value === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.w, slice.h);
  }

  ctx.drawImage(sourceImageCanvas, slice.x, slice.y, slice.w, slice.h, 0, 0, slice.w, slice.h);
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
      : `五图切片-${images.length}张原图`;
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
  renderThumbs();
  drawPreview();
});
els.backgroundMode.addEventListener("change", () => {
  renderThumbs();
  drawPreview();
});
els.alphaThreshold.addEventListener("input", () => {
  els.alphaOutput.textContent = els.alphaThreshold.value;
});
els.colorTolerance.addEventListener("input", () => {
  els.toleranceOutput.textContent = els.colorTolerance.value;
});
els.sliceBtn.addEventListener("click", runSlice);
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

resetTool();
