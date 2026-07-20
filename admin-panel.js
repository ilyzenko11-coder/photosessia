(function () {
  "use strict";

  const API_BASE = (document.querySelector('meta[name="admin-api-base"]')?.content || "").replace(/\/$/, "");
  const API_ROOT = `${API_BASE}/api/admin`;
  const ADMIN_HINT_KEY = "adminUiHint";
  const TEXT_TAGS = new Set([
    "A", "BLOCKQUOTE", "BUTTON", "DD", "DT", "FIGCAPTION", "H1", "H2", "H3",
    "H4", "H5", "H6", "LABEL", "LI", "P", "SPAN", "TD", "TH"
  ]);

  const pendingChanges = new Map();
  const bypassAdminCheck = new WeakSet();
  const checkingForms = new WeakSet();
  const selectorCache = new WeakMap();
  const pendingImageDeletes = new Set();
  let selectedElement = null;
  let savedTextRange = null;
  let activeInlineSpan = null;
  let changesObserver = null;
  let serverChanges = [];
  let resizeHandle = null;
  let resizeState = null;
  let textMoveHandle = null;
  let textMoveState = null;

  function getPageKey() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    return path;
  }

  function getAdminHint() {
    try {
      return localStorage.getItem(ADMIN_HINT_KEY) === "true" || localStorage.getItem("adminMode") === "true";
    } catch (error) {
      return false;
    }
  }

  function setAdminHint(enabled) {
    try {
      localStorage.removeItem("adminMode");
      if (enabled) localStorage.setItem(ADMIN_HINT_KEY, "true");
      else localStorage.removeItem(ADMIN_HINT_KEY);
    } catch (error) {
      // The HttpOnly server session remains authoritative if localStorage is unavailable.
    }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      // A non-JSON response is handled through response.ok below.
    }
    return { response, data };
  }

  function setStatus(message) {
    const status = document.querySelector("#admin-panel [data-admin-status]");
    if (!status) return;
    status.textContent = message;
    window.clearTimeout(setStatus.timeoutId);
    setStatus.timeoutId = window.setTimeout(() => {
      status.textContent = "";
    }, 2800);
  }

  function escapeSelector(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function generateSelector(element) {
    if (!(element instanceof Element)) return "";
    if (selectorCache.has(element)) return selectorCache.get(element);
    if (element.dataset.adminTextId) {
      const textSelector = `[data-admin-text-id="${escapeSelector(element.dataset.adminTextId)}"]`;
      selectorCache.set(element, textSelector);
      return textSelector;
    }
    if (element.dataset.adminImageId) {
      const imageSelector = `[data-admin-image-id="${escapeSelector(element.dataset.adminImageId)}"]`;
      selectorCache.set(element, imageSelector);
      return imageSelector;
    }
    if (element.id) {
      const idSelector = `#${escapeSelector(element.id)}`;
      selectorCache.set(element, idSelector);
      return idSelector;
    }

    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let segment = current.tagName.toLowerCase();
      const stableClasses = Array.from(current.classList)
        .filter((className) => !className.startsWith("admin-panel-"))
        .slice(0, 3);

      if (stableClasses.length) {
        segment += stableClasses.map((className) => `.${escapeSelector(className)}`).join("");
      }

      const sameTagSiblings = current.parentElement
        ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName)
        : [];
      if (sameTagSiblings.length > 1) {
        segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }

      path.unshift(segment);
      const selector = path.join(" > ");
      try {
        if (document.querySelectorAll(selector).length === 1) {
          selectorCache.set(element, selector);
          return selector;
        }
      } catch (error) {
        // Continue building a fully qualified selector.
      }

      if (current === document.body) break;
      current = current.parentElement;
    }

    const selector = path.join(" > ");
    selectorCache.set(element, selector);
    return selector;
  }

  function changeKey(change) {
    let suffix = "";
    if (change?.property === "insertImage" || change?.property === "insertText") {
      try { suffix = `:${JSON.parse(change.value).id || ""}`; } catch (error) { suffix = ""; }
    }
    return `${change.selector}::${change.property}${suffix}`;
  }

  function stageChange(element, property, value) {
    const selector = generateSelector(element);
    if (!selector) return;
    const change = { selector, property, value };
    pendingChanges.set(changeKey(change), change);
    setStatus("Есть несохранённые изменения");
  }

  function applyChange(change) {
    if (!change || !change.selector || !change.property) return false;
    if (pendingChanges.has(changeKey(change))) return false;

    let element;
    try {
      element = document.querySelector(change.selector);
    } catch (error) {
      console.warn(`Admin Panel: некорректный селектор ${change.selector}.`, error);
      return false;
    }
    if (change.property === "insertImage") {
      if (!element || element.closest("#admin-panel")) return false;
      try {
        const imageData = JSON.parse(change.value);
        if (document.querySelector(`[data-admin-image-id="${escapeSelector(imageData.id)}"]`)) return true;
        const image = document.createElement("img");
        image.src = imageData.url;
        image.alt = imageData.alt || "";
        image.loading = "lazy";
        image.dataset.adminImageId = imageData.id;
        image.classList.add("admin-added-image");
        image.style.width = imageData.width;
        image.style.height = "auto";
        if (imageData.position === "append") element.appendChild(image);
        else element.insertAdjacentElement("afterend", image);
        return true;
      } catch (error) {
        console.warn("Admin Panel: не удалось добавить сохранённое фото.", error);
        return false;
      }
    }
    if (change.property === "insertText") {
      if (!element || element.closest("#admin-panel")) return false;
      try {
        const textData = JSON.parse(change.value);
        if (document.querySelector(`[data-admin-text-id="${escapeSelector(textData.id)}"]`)) return true;
        createInsertedTextElement(element, textData);
        return true;
      } catch (error) {
        console.warn("Admin Panel: не удалось добавить сохранённый текстовый блок.", error);
        return false;
      }
    }
    if (!element || element.closest("#admin-panel")) return false;

    if (change.property === "removeElement") {
      element.remove();
    } else if (change.property === "blockOrder") {
      const parent = element.parentElement;
      if (!parent) return false;
      const siblings = Array.from(parent.children);
      const currentIndex = siblings.indexOf(element);
      const desiredIndex = Math.max(0, Math.min(Number(change.value), siblings.length - 1));
      if (currentIndex !== desiredIndex) {
        const withoutElement = siblings.filter((sibling) => sibling !== element);
        parent.insertBefore(element, withoutElement[desiredIndex] || null);
      }
    } else if (change.property === "innerHTML" && element.innerHTML !== String(change.value)) {
      element.innerHTML = String(change.value);
    } else if (["fontSize", "color", "fontFamily", "width", "translate"].includes(change.property)) {
      if (element.style[change.property] !== String(change.value)) {
        element.style[change.property] = String(change.value);
        if (change.property === "width" && element instanceof HTMLImageElement) {
          element.style.height = "auto";
        }
      }
    }
    return true;
  }

  function startChangesObserver() {
    // Pages are fully built before loadChanges runs. Observing the whole document
    // caused every edit to re-apply all saved changes and could lock large pages.
    changesObserver?.disconnect();
    changesObserver = null;
  }

  async function loadChanges() {
    const embedded = document.getElementById("photosessia-admin-changes");
    if (embedded) {
      try {
        const parsed = JSON.parse(embedded.textContent || "[]");
        if (Array.isArray(parsed)) {
          serverChanges = parsed;
          serverChanges.forEach(applyChange);
          startChangesObserver();
          return;
        }
      } catch (error) {
        console.warn("Admin Panel: не удалось прочитать изменения из HTML.", error);
      }
    }
    try {
      const query = new URLSearchParams({ page: getPageKey() });
      const { response, data } = await apiRequest(`/changes?${query}`);
      if (!response.ok || !Array.isArray(data.changes)) throw new Error(`HTTP ${response.status}`);
      serverChanges = data.changes;
      serverChanges.forEach(applyChange);
    } catch (error) {
      console.warn("Admin Panel: серверные изменения временно недоступны.", error);
    } finally {
      startChangesObserver();
    }
  }

  async function saveChanges() {
    if (selectedElement && selectedElement.isContentEditable) {
      stageChange(selectedElement, "innerHTML", selectedElement.innerHTML);
    }

    const merged = new Map();
    serverChanges.forEach((change) => merged.set(changeKey(change), change));
    pendingChanges.forEach((change, key) => merged.set(key, change));
    const nextChanges = Array.from(merged.values());
    const saveButton = document.querySelector("#admin-panel [data-admin-save]");
    if (saveButton) saveButton.disabled = true;
    setStatus("Сохранение на сервере…");

    try {
      const { response, data } = await apiRequest("/changes", {
        method: "PUT",
        body: JSON.stringify({ page: getPageKey(), changes: nextChanges }),
      });
      if (response.status === 401) {
        setAdminHint(false);
        throw new Error("Сессия администратора истекла. Войдите снова.");
      }
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      serverChanges = nextChanges;
      pendingChanges.clear();
      const failedDeletes = [];
      for (const imageId of pendingImageDeletes) {
        const { response: deleteResponse } = await apiRequest(`/images/${encodeURIComponent(imageId)}`, { method: "DELETE" });
        if (!deleteResponse.ok) failedDeletes.push(imageId);
      }
      pendingImageDeletes.clear();
      failedDeletes.forEach((imageId) => pendingImageDeletes.add(imageId));
      if (failedDeletes.length) throw new Error("Изменения сохранены, но файл фото пока не удалён");
      setStatus("Изменения сохранены на сервере");
    } catch (error) {
      console.error("Admin Panel: не удалось сохранить изменения.", error);
      setStatus(error.message || "Ошибка сохранения");
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  async function checkAdminTrigger(inputValue) {
    const code = String(inputValue || "").replace(/\D/g, "");
    if (!code) return false;
    try {
      const { response, data } = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (!response.ok || !data.ok) return false;
      setAdminHint(true);
      return true;
    } catch (error) {
      console.warn("Admin Panel: проверка входа временно недоступна.", error);
      return false;
    }
  }

  function activateAdmin() {
    const url = new URL(window.location.href);
    url.searchParams.set("admin", "true");
    window.location.replace(url.toString());
  }

  async function exitAdminMode() {
    try {
      await apiRequest("/logout", { method: "POST", body: "{}" });
    } catch (error) {
      console.warn("Admin Panel: серверный выход завершился с ошибкой.", error);
    }
    setAdminHint(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("admin");
    window.location.replace(url.toString());
  }

  async function hasAdminSession() {
    try {
      const { response, data } = await apiRequest("/session");
      return response.ok && data.authenticated === true;
    } catch (error) {
      return false;
    }
  }

  function hasDirectText(element) {
    return Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
  }

  function findTextElement(target) {
    let current = target instanceof Element ? target : target?.parentElement;
    while (current && current !== document.body) {
      if (TEXT_TAGS.has(current.tagName) && hasDirectText(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function colorToHex(color) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    const values = color.match(/\d+(?:\.\d+)?/g);
    if (!values || values.length < 3) return "#111111";
    return `#${values.slice(0, 3).map((value) => Math.round(Number(value)).toString(16).padStart(2, "0")).join("")}`;
  }

  function rangeIsInsideSelectedElement(range) {
    if (!range || range.collapsed || !selectedElement || selectedElement instanceof HTMLImageElement) return false;
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    return Boolean(container && (container === selectedElement || selectedElement.contains(container)));
  }

  function captureTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!rangeIsInsideSelectedElement(range)) return;
    savedTextRange = range.cloneRange();
    activeInlineSpan = null;
    updatePanelState();
  }

  function getTextStyleReference() {
    if (activeInlineSpan?.isConnected) return activeInlineSpan;
    if (rangeIsInsideSelectedElement(savedTextRange)) {
      const node = savedTextRange.startContainer;
      return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    }
    return selectedElement;
  }

  function applyTextStyle(property, value) {
    if (!selectedElement || selectedElement instanceof HTMLImageElement) return;

    if (rangeIsInsideSelectedElement(savedTextRange)) {
      let span = activeInlineSpan;
      if (!span?.isConnected) {
        span = document.createElement("span");
        try {
          savedTextRange.surroundContents(span);
        } catch (error) {
          const fragment = savedTextRange.extractContents();
          span.appendChild(fragment);
          savedTextRange.insertNode(span);
        }
        activeInlineSpan = span;
        const nextRange = document.createRange();
        nextRange.selectNodeContents(span);
        savedTextRange = nextRange;
      }
      span.style[property] = value;
      stageChange(selectedElement, "innerHTML", selectedElement.innerHTML);
      updateTextMoveHandle();
      return;
    }

    selectedElement.style[property] = value;
    stageChange(selectedElement, property, value);
    updateTextMoveHandle();
  }

  function getMovableTextBlock() {
    if (!selectedElement || selectedElement instanceof HTMLImageElement) return null;
    let current = selectedElement;
    while (current && current !== document.body) {
      if (current.dataset.adminTextId) return current;
      const display = getComputedStyle(current).display;
      if (["block", "flex", "grid", "list-item"].includes(display) && current.parentElement) return current;
      current = current.parentElement;
    }
    return null;
  }

  function moveSelectedBlockUp() {
    const block = getMovableTextBlock();
    const previous = block?.previousElementSibling;
    if (!block || !previous || !block.parentElement) {
      setStatus("Выбранный блок уже находится сверху");
      return;
    }

    generateSelector(block);
    const parent = block.parentElement;
    parent.insertBefore(block, previous);
    const nextIndex = Array.from(parent.children).indexOf(block);
    stageChange(block, "blockOrder", String(nextIndex));
    updatePanelState();
    setStatus("Блок поднят — нажмите «Сохранить»");
  }

  function updatePanelState() {
    const panel = document.getElementById("admin-panel");
    if (!panel) return;
    const isText = Boolean(selectedElement && !(selectedElement instanceof HTMLImageElement));
    const isImage = selectedElement instanceof HTMLImageElement;

    panel.querySelectorAll("[data-text-control]").forEach((control) => {
      control.disabled = !isText;
    });
    panel.querySelectorAll("[data-image-control]").forEach((control) => {
      control.disabled = !isImage;
    });
    const addImageButton = panel.querySelector("[data-admin-image-add]");
    if (addImageButton) addImageButton.disabled = !selectedElement;
    const addTextButton = panel.querySelector("[data-admin-text-add]");
    if (addTextButton) addTextButton.disabled = !selectedElement;
    const blockUpButton = panel.querySelector("[data-admin-block-up]");
    if (blockUpButton) {
      blockUpButton.disabled = !isText || !getMovableTextBlock()?.previousElementSibling;
    }
    const movableTextBlock = isText ? getMovableTextBlock() : null;
    const resetTextPositionButton = panel.querySelector("[data-admin-text-reset]");
    if (resetTextPositionButton) resetTextPositionButton.disabled = !movableTextBlock;
    const deleteTextButton = panel.querySelector("[data-admin-text-delete]");
    if (deleteTextButton) deleteTextButton.disabled = !movableTextBlock?.dataset.adminTextId;

    if (isText) {
      const style = getComputedStyle(getTextStyleReference() || selectedElement);
      const familySelect = panel.querySelector("[data-admin-font]");
      const matchingOption = Array.from(familySelect.options).find((option) =>
        style.fontFamily.toLowerCase().includes(option.value.toLowerCase().replace(/[\"']/g, ""))
      );
      if (matchingOption) familySelect.value = matchingOption.value;
      panel.querySelector("[data-admin-color]").value = colorToHex(style.color);
      panel.querySelector("[data-admin-font-size-input]").value = String(Math.round(parseFloat(style.fontSize) || 16));
    }
    updateResizeHandle();
    updateTextMoveHandle();
  }

  function selectElement(element) {
    if (selectedElement === element) {
      updatePanelState();
      return;
    }
    if (selectedElement && selectedElement !== element) {
      selectedElement.classList.remove("admin-panel-selected");
      if (selectedElement.isContentEditable) selectedElement.removeAttribute("contenteditable");
    }

    selectedElement = element;
    savedTextRange = null;
    activeInlineSpan = null;
    selectedElement.classList.add("admin-panel-selected");
    if (!(selectedElement instanceof HTMLImageElement)) {
      selectedElement.setAttribute("contenteditable", "true");
      selectedElement.setAttribute("spellcheck", "true");
      selectedElement.focus({ preventScroll: true });
    }
    updatePanelState();
  }

  function updateResizeHandle() {
    if (!resizeHandle) return;
    if (!(selectedElement instanceof HTMLImageElement) || !selectedElement.isConnected) {
      resizeHandle.hidden = true;
      return;
    }
    const rect = selectedElement.getBoundingClientRect();
    resizeHandle.hidden = false;
    resizeHandle.style.left = `${Math.max(0, rect.right - 9)}px`;
    resizeHandle.style.top = `${Math.max(0, rect.bottom - 9)}px`;
  }

  function finishImageResize() {
    if (!resizeState) return;
    const image = resizeState.image;
    resizeState = null;
    document.body.classList.remove("admin-image-resizing");
    if (image.isConnected && image.style.width) stageChange(image, "width", image.style.width);
    updateResizeHandle();
  }

  function createResizeHandle() {
    resizeHandle = document.createElement("button");
    resizeHandle.id = "admin-image-resize-handle";
    resizeHandle.type = "button";
    resizeHandle.hidden = true;
    resizeHandle.setAttribute("aria-label", "Изменить размер выбранного фото");
    document.body.appendChild(resizeHandle);

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (!(selectedElement instanceof HTMLImageElement) || !selectedElement.parentElement) return;
      const parentWidth = selectedElement.parentElement.getBoundingClientRect().width;
      if (!parentWidth) return;
      event.preventDefault();
      resizeState = {
        image: selectedElement,
        startX: event.clientX,
        startWidth: selectedElement.getBoundingClientRect().width,
        parentWidth,
      };
      resizeHandle.setPointerCapture(event.pointerId);
      document.body.classList.add("admin-image-resizing");
    });
    resizeHandle.addEventListener("pointermove", (event) => {
      if (!resizeState || !resizeHandle.hasPointerCapture(event.pointerId)) return;
      const width = resizeState.startWidth + event.clientX - resizeState.startX;
      const percent = Math.max(10, Math.min(200, (width / resizeState.parentWidth) * 100));
      resizeState.image.style.width = `${Number(percent.toFixed(2))}%`;
      resizeState.image.style.height = "auto";
      updateResizeHandle();
    });
    resizeHandle.addEventListener("pointerup", finishImageResize);
    resizeHandle.addEventListener("pointercancel", finishImageResize);
    window.addEventListener("scroll", updateResizeHandle, true);
    window.addEventListener("resize", updateResizeHandle);
  }

  function readTextTranslate(element) {
    const value = element?.style.translate || "0px 0px";
    const numbers = value.match(/-?\d+(?:\.\d+)?/g) || [];
    return {
      x: Number(numbers[0] || 0),
      y: Number(numbers[1] || 0),
    };
  }

  function updateTextMoveHandle() {
    if (!textMoveHandle) return;
    const block = getMovableTextBlock();
    if (!block?.isConnected || selectedElement instanceof HTMLImageElement) {
      textMoveHandle.hidden = true;
      return;
    }
    const rect = block.getBoundingClientRect();
    textMoveHandle.hidden = false;
    textMoveHandle.style.left = `${Math.max(4, rect.left - 13)}px`;
    textMoveHandle.style.top = `${Math.max(62, rect.top - 13)}px`;
  }

  function finishTextMove() {
    if (!textMoveState) return;
    const block = textMoveState.block;
    textMoveState = null;
    document.body.classList.remove("admin-text-moving");
    if (block.isConnected) {
      stageChange(block, "translate", block.style.translate || "0px 0px");
    }
    updateTextMoveHandle();
  }

  function createTextMoveHandle() {
    textMoveHandle = document.createElement("button");
    textMoveHandle.id = "admin-text-move-handle";
    textMoveHandle.type = "button";
    textMoveHandle.hidden = true;
    textMoveHandle.textContent = "✥";
    textMoveHandle.setAttribute("aria-label", "Перетащить выбранный текстовый блок");
    textMoveHandle.title = "Перетащить текстовый блок";
    document.body.appendChild(textMoveHandle);

    textMoveHandle.addEventListener("pointerdown", (event) => {
      const block = getMovableTextBlock();
      if (!block) return;
      const current = readTextTranslate(block);
      event.preventDefault();
      textMoveState = {
        block,
        startX: event.clientX,
        startY: event.clientY,
        translateX: current.x,
        translateY: current.y,
      };
      textMoveHandle.setPointerCapture(event.pointerId);
      document.body.classList.add("admin-text-moving");
    });
    textMoveHandle.addEventListener("pointermove", (event) => {
      if (!textMoveState || !textMoveHandle.hasPointerCapture(event.pointerId)) return;
      const x = Math.max(-5000, Math.min(5000, textMoveState.translateX + event.clientX - textMoveState.startX));
      const y = Math.max(-5000, Math.min(5000, textMoveState.translateY + event.clientY - textMoveState.startY));
      textMoveState.block.style.translate = `${Number(x.toFixed(1))}px ${Number(y.toFixed(1))}px`;
      updateTextMoveHandle();
    });
    textMoveHandle.addEventListener("pointerup", finishTextMove);
    textMoveHandle.addEventListener("pointercancel", finishTextMove);
    textMoveHandle.addEventListener("keydown", (event) => {
      const directions = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      const block = getMovableTextBlock();
      if (!direction || !block) return;
      event.preventDefault();
      const current = readTextTranslate(block);
      const step = event.shiftKey ? 10 : 1;
      const x = Math.max(-5000, Math.min(5000, current.x + direction[0] * step));
      const y = Math.max(-5000, Math.min(5000, current.y + direction[1] * step));
      block.style.translate = `${x}px ${y}px`;
      stageChange(block, "translate", block.style.translate);
      updateTextMoveHandle();
    });
    window.addEventListener("scroll", updateTextMoveHandle, true);
    window.addEventListener("resize", updateTextMoveHandle);
  }

  function resetSelectedTextPosition() {
    const block = getMovableTextBlock();
    if (!block) return;
    block.style.translate = "0px 0px";
    stageChange(block, "translate", block.style.translate);
    updateTextMoveHandle();
    setStatus("Позиция блока сброшена — нажмите «Сохранить»");
  }

  function setFontSize(value) {
    if (!selectedElement || selectedElement instanceof HTMLImageElement) return;
    const nextSize = Math.max(8, Math.min(160, Number(value) || 16));
    applyTextStyle("fontSize", `${Number(nextSize.toFixed(1))}px`);
    const input = document.querySelector("#admin-panel [data-admin-font-size-input]");
    if (input) input.value = String(Number(nextSize.toFixed(1)));
  }

  function changeFontSize(delta) {
    if (!selectedElement || selectedElement instanceof HTMLImageElement) return;
    const currentSize = parseFloat(getComputedStyle(getTextStyleReference() || selectedElement).fontSize) || 16;
    setFontSize(currentSize + delta);
  }

  function changeImageSize(delta) {
    if (!(selectedElement instanceof HTMLImageElement) || !selectedElement.parentElement) return;
    const parentWidth = selectedElement.parentElement.getBoundingClientRect().width;
    if (!parentWidth) return;
    const currentPercent = (selectedElement.getBoundingClientRect().width / parentWidth) * 100;
    const nextPercent = Math.max(10, Math.min(200, currentPercent + delta));
    selectedElement.style.width = `${Number(nextPercent.toFixed(2))}%`;
    selectedElement.style.height = "auto";
    stageChange(selectedElement, "width", selectedElement.style.width);
    updateResizeHandle();
  }

  function getImageInsertAnchor() {
    if (!selectedElement) return null;
    if (selectedElement instanceof HTMLImageElement && selectedElement.dataset.adminImageId) {
      return { element: selectedElement.parentElement, position: "append" };
    }
    if (selectedElement instanceof HTMLImageElement) return { element: selectedElement, position: "afterend" };
    return { element: getMovableTextBlock() || selectedElement, position: "afterend" };
  }

  async function uploadImage(file) {
    const anchor = getImageInsertAnchor();
    if (!anchor?.element || !file) return;
    if (!/^image\/(?:jpeg|png|webp|gif)$/.test(file.type)) {
      setStatus("Допустимы JPG, PNG, WebP и GIF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus("Фото должно быть не больше 10 МБ");
      return;
    }

    const addButton = document.querySelector("#admin-panel [data-admin-image-add]");
    if (addButton) addButton.disabled = true;
    setStatus("Загрузка фото на сервер…");
    try {
      const { response, data } = await apiRequest("/images", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const imageData = {
        id: data.id,
        url: data.url,
        alt: file.name.replace(/\.[^.]+$/, ""),
        width: "100%",
        position: anchor.position,
      };
      const change = {
        selector: generateSelector(anchor.element),
        property: "insertImage",
        value: JSON.stringify(imageData),
      };
      applyChange({ ...change, property: "insertImage" });
      pendingChanges.set(changeKey(change), change);
      const image = document.querySelector(`[data-admin-image-id="${escapeSelector(data.id)}"]`);
      if (image) selectElement(image);
      setStatus("Фото добавлено — нажмите «Сохранить»");
    } catch (error) {
      console.error("Admin Panel: не удалось загрузить фото.", error);
      setStatus(error.message || "Ошибка загрузки фото");
    } finally {
      if (addButton) addButton.disabled = !selectedElement;
    }
  }

  function createInsertedTextElement(anchor, textData) {
    const block = document.createElement(textData.tag || "p");
    block.dataset.adminTextId = textData.id;
    block.classList.add("admin-added-text-block");
    block.innerHTML = textData.html || "Новый текстовый блок";
    if (textData.position === "append") anchor.appendChild(block);
    else anchor.insertAdjacentElement("afterend", block);
    return block;
  }

  function getTextInsertAnchor() {
    if (!selectedElement) return null;
    if (selectedElement instanceof HTMLImageElement && selectedElement.dataset.adminImageId) {
      return { element: selectedElement.parentElement, position: "append" };
    }
    if (selectedElement instanceof HTMLImageElement) {
      return { element: selectedElement, position: "afterend" };
    }
    return { element: getMovableTextBlock() || selectedElement, position: "afterend" };
  }

  function createTextBlock() {
    const anchor = getTextInsertAnchor();
    if (!anchor?.element) {
      setStatus("Сначала выберите место рядом с текстом или фото");
      return;
    }
    const textData = {
      id: `admin-text-${crypto.randomUUID()}`,
      tag: "p",
      html: "Новый текстовый блок",
      position: anchor.position,
    };
    const change = {
      selector: generateSelector(anchor.element),
      property: "insertText",
      value: JSON.stringify(textData),
    };
    const block = createInsertedTextElement(anchor.element, textData);
    pendingChanges.set(changeKey(change), change);
    selectElement(block);
    block.focus({ preventScroll: true });
    document.execCommand?.("selectAll", false);
    setStatus("Текстовый блок добавлен — введите текст и нажмите «Сохранить»");
  }

  function deleteSelectedTextBlock() {
    const block = getMovableTextBlock();
    const textId = block?.dataset.adminTextId;
    if (!block || !textId) return;
    const selector = generateSelector(block);

    serverChanges = serverChanges.filter((change) => {
      if (change.property === "insertText") {
        try { return JSON.parse(change.value).id !== textId; } catch (error) { return true; }
      }
      return change.selector !== selector;
    });
    for (const [key, change] of pendingChanges) {
      let isMatchingInsert = false;
      if (change.property === "insertText") {
        try { isMatchingInsert = JSON.parse(change.value).id === textId; } catch (error) { isMatchingInsert = false; }
      }
      if (isMatchingInsert || change.selector === selector) pendingChanges.delete(key);
    }

    block.classList.remove("admin-panel-selected");
    block.remove();
    selectedElement = null;
    updatePanelState();
    setStatus("Текстовый блок удалён — нажмите «Сохранить»");
  }

  function deleteSelectedImage() {
    if (!(selectedElement instanceof HTMLImageElement)) return;
    const image = selectedElement;
    const selector = generateSelector(image);
    const imageId = image.dataset.adminImageId;

    if (imageId) {
      serverChanges = serverChanges.filter((change) => {
        if (change.property === "insertImage") {
          try { return JSON.parse(change.value).id !== imageId; } catch (error) { return true; }
        }
        return change.selector !== selector;
      });
      for (const [key, change] of pendingChanges) {
        let isMatchingInsert = false;
        if (change.property === "insertImage") {
          try { isMatchingInsert = JSON.parse(change.value).id === imageId; } catch (error) { isMatchingInsert = false; }
        }
        if (isMatchingInsert || change.selector === selector) pendingChanges.delete(key);
      }
      pendingImageDeletes.add(imageId);
    } else {
      stageChange(image, "removeElement", "true");
    }

    image.classList.remove("admin-panel-selected");
    image.remove();
    selectedElement = null;
    updatePanelState();
    setStatus("Фото удалено — нажмите «Сохранить»");
  }

  function initAdminPanel() {
    if (document.getElementById("admin-panel")) return;

    document.body.classList.add("admin-mode-active");
    const panel = document.createElement("div");
    panel.id = "admin-panel";
    panel.setAttribute("role", "toolbar");
    panel.setAttribute("aria-label", "Панель администратора");
    panel.innerHTML = `
      <strong class="admin-panel-title">🔧 ADMIN MODE</strong>
      <label class="admin-panel-field">Шрифт:
        <select data-admin-font data-text-control disabled>
          <option value="Arial">Arial</option>
          <option value="Roboto">Roboto</option>
          <option value="Georgia">Georgia</option>
          <option value="Cormorant Garamond">Cormorant Garamond</option>
          <option value="Manrope">Manrope</option>
          <option value="Times New Roman">Times New Roman</option>
        </select>
      </label>
      <span class="admin-panel-field">Размер:
        <button type="button" data-admin-font-size="-2" data-text-control disabled aria-label="Уменьшить размер шрифта">−</button>
        <input type="number" min="8" max="160" step="1" value="16" data-admin-font-size-input data-text-control disabled aria-label="Размер шрифта в пикселях" />
        <button type="button" data-admin-font-size="2" data-text-control disabled aria-label="Увеличить размер шрифта">+</button>
      </span>
      <label class="admin-panel-field">Цвет текста:
        <input type="color" value="#111111" data-admin-color data-text-control disabled aria-label="Цвет текста" />
      </label>
      <span class="admin-panel-field">Блок:
        <button type="button" data-admin-block-up data-text-control disabled aria-label="Поднять выбранный текстовый блок">↑</button>
        <button type="button" data-admin-text-reset data-text-control disabled aria-label="Сбросить позицию текстового блока">Сбросить позицию</button>
        <button type="button" data-admin-text-add disabled aria-label="Создать новый текстовый блок">＋ Текст</button>
        <button type="button" data-admin-text-delete disabled aria-label="Удалить созданный текстовый блок">Удалить</button>
      </span>
      <span class="admin-panel-field">Фото:
        <button type="button" data-admin-image-add disabled aria-label="Добавить фото">＋ Добавить</button>
        <button type="button" data-admin-image-delete data-image-control disabled aria-label="Удалить выбранное фото">Удалить</button>
        <button type="button" data-admin-image-size="-10" data-image-control disabled aria-label="Уменьшить фото">−</button>
        <button type="button" data-admin-image-size="10" data-image-control disabled aria-label="Увеличить фото">+</button>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-admin-image-file hidden />
      </span>
      <button class="admin-panel-save" type="button" data-admin-save>💾 Сохранить</button>
      <button class="admin-panel-exit" type="button" data-admin-exit aria-label="Выйти из режима администратора">❌</button>
      <span class="admin-panel-status" data-admin-status aria-live="polite"></span>
    `;
    document.body.appendChild(panel);
    createResizeHandle();
    createTextMoveHandle();

    panel.querySelector("[data-admin-font]").addEventListener("change", (event) => {
      if (!selectedElement || selectedElement instanceof HTMLImageElement) return;
      applyTextStyle("fontFamily", event.target.value);
    });
    panel.querySelector("[data-admin-color]").addEventListener("input", (event) => {
      if (!selectedElement || selectedElement instanceof HTMLImageElement) return;
      applyTextStyle("color", event.target.value);
    });
    panel.querySelectorAll("[data-admin-font-size]").forEach((button) => {
      button.addEventListener("click", () => changeFontSize(Number(button.dataset.adminFontSize)));
    });
    panel.querySelector("[data-admin-font-size-input]").addEventListener("input", (event) => {
      if (event.target.value !== "") setFontSize(event.target.value);
    });
    panel.querySelectorAll("[data-admin-image-size]").forEach((button) => {
      button.addEventListener("click", () => changeImageSize(Number(button.dataset.adminImageSize)));
    });
    const imageFileInput = panel.querySelector("[data-admin-image-file]");
    panel.querySelector("[data-admin-image-add]").addEventListener("click", () => imageFileInput.click());
    imageFileInput.addEventListener("change", () => {
      const file = imageFileInput.files?.[0];
      imageFileInput.value = "";
      if (file) void uploadImage(file);
    });
    panel.querySelector("[data-admin-image-delete]").addEventListener("click", deleteSelectedImage);
    panel.querySelector("[data-admin-block-up]").addEventListener("click", moveSelectedBlockUp);
    panel.querySelector("[data-admin-text-add]").addEventListener("click", createTextBlock);
    panel.querySelector("[data-admin-text-delete]").addEventListener("click", deleteSelectedTextBlock);
    panel.querySelector("[data-admin-text-reset]").addEventListener("click", resetSelectedTextPosition);
    panel.querySelector("[data-admin-save]").addEventListener("click", saveChanges);
    panel.querySelector("[data-admin-exit]").addEventListener("click", exitAdminMode);

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("#admin-panel, #admin-image-resize-handle, #admin-text-move-handle")) return;
      const image = target.closest("img");
      const textElement = image ? null : findTextElement(target);
      if (!image && !textElement) return;
      event.preventDefault();
      event.stopPropagation();
      selectElement(image || textElement);
    }, true);

    document.addEventListener("input", (event) => {
      if (event.target === selectedElement && selectedElement.isContentEditable) {
        stageChange(selectedElement, "innerHTML", selectedElement.innerHTML);
        updateTextMoveHandle();
      }
    });
    document.addEventListener("selectionchange", captureTextSelection);
  }

  function resumeNormalSubmit(form, submitter) {
    bypassAdminCheck.add(form);
    try {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit(submitter instanceof HTMLElement && submitter.form === form ? submitter : undefined);
      } else {
        form.submit();
      }
    } finally {
      queueMicrotask(() => bypassAdminCheck.delete(form));
    }
  }

  function isLikelyAdminAttempt(form, phoneField) {
    return Array.from(form.elements).every((field) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return true;
      if (field === phoneField || field.disabled || field.type === "hidden") return true;
      if (field instanceof HTMLSelectElement && /страна|country/i.test(field.name)) return true;
      if (field.type === "checkbox" || field.type === "radio") return !field.checked;
      return !String(field.value || "").trim();
    });
  }

  async function tryAdminLogin(form, event, submitter) {
    if (!(form instanceof HTMLFormElement)) return false;
    if (bypassAdminCheck.has(form)) {
      bypassAdminCheck.delete(form);
      return false;
    }
    const phoneField = form.querySelector('input[type="tel"], input[name="Телефон"], input[name*="phone" i]');
    if (!phoneField || !isLikelyAdminAttempt(form, phoneField)) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (checkingForms.has(form)) return true;
    checkingForms.add(form);

    const isAdmin = await checkAdminTrigger(phoneField.value);
    checkingForms.delete(form);
    if (isAdmin) {
      activateAdmin();
      return true;
    }
    resumeNormalSubmit(form, submitter);
    return false;
  }

  document.addEventListener("submit", (event) => {
    void tryAdminLogin(event.target, event, event.submitter);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const submitControl = target?.closest('button[type="submit"], input[type="submit"]');
    if (!submitControl) return;
    void tryAdminLogin(submitControl.form || submitControl.closest("form"), event, submitControl);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    const form = event.target.form;
    if (!form || !form.contains(event.target)) return;
    void tryAdminLogin(form, event, null);
  }, true);

  window.checkAdminTrigger = checkAdminTrigger;
  window.activateAdmin = activateAdmin;
  window.initAdminPanel = initAdminPanel;
  window.saveChanges = saveChanges;
  window.loadChanges = loadChanges;
  window.generateSelector = generateSelector;
  window.exitAdminMode = exitAdminMode;

  async function boot() {
    const loadPromise = loadChanges();
    const adminRequested = getAdminHint() || new URLSearchParams(window.location.search).get("admin") === "true";
    if (adminRequested) {
      if (await hasAdminSession()) {
        setAdminHint(true);
        initAdminPanel();
      } else {
        setAdminHint(false);
      }
    }
    await loadPromise;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
  } else {
    void boot();
  }
})();
