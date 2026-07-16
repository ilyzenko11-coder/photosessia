(function () {
  "use strict";

  const ADMIN_STORAGE_KEY = "adminMode";
  const CHANGES_STORAGE_KEY = "adminChanges";
  const SECRET_CODE = "7319462850";
  const TEXT_TAGS = new Set([
    "A", "BLOCKQUOTE", "BUTTON", "DD", "DT", "FIGCAPTION", "H1", "H2", "H3",
    "H4", "H5", "H6", "LABEL", "LI", "P", "SPAN", "TD", "TH"
  ]);

  const pendingChanges = new Map();
  let selectedElement = null;
  let changesObserver = null;

  function getPageKey() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    return `${window.location.origin}${path}`;
  }

  function readAllChanges() {
    try {
      const stored = JSON.parse(localStorage.getItem(CHANGES_STORAGE_KEY) || "{}");
      return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    } catch (error) {
      console.warn("Admin Panel: не удалось прочитать сохранённые изменения.", error);
      return {};
    }
  }

  function setStatus(message) {
    const status = document.querySelector("#admin-panel [data-admin-status]");
    if (!status) return;
    status.textContent = message;
    window.clearTimeout(setStatus.timeoutId);
    setStatus.timeoutId = window.setTimeout(() => {
      status.textContent = "";
    }, 2500);
  }

  function escapeSelector(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function generateSelector(element) {
    if (!(element instanceof Element)) return "";
    if (element.id) return `#${escapeSelector(element.id)}`;

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
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch (error) {
        // Continue building a fully qualified selector.
      }

      if (current === document.body) break;
      current = current.parentElement;
    }

    return path.join(" > ");
  }

  function stageChange(element, property, value) {
    const selector = generateSelector(element);
    if (!selector) return;
    pendingChanges.set(`${selector}::${property}`, { selector, property, value });
    setStatus("Есть несохранённые изменения");
  }

  function applyChange(change) {
    if (!change || !change.selector || !change.property) return false;
    if (pendingChanges.has(`${change.selector}::${change.property}`)) return false;

    let element;
    try {
      element = document.querySelector(change.selector);
    } catch (error) {
      console.warn(`Admin Panel: некорректный селектор ${change.selector}.`, error);
      return false;
    }
    if (!element || element.closest("#admin-panel")) return false;

    if (change.property === "innerHTML" && element.innerHTML !== String(change.value)) {
      element.innerHTML = String(change.value);
    } else if (["fontSize", "color", "fontFamily", "width"].includes(change.property)) {
      if (element.style[change.property] !== String(change.value)) {
        element.style[change.property] = String(change.value);
        if (change.property === "width" && element instanceof HTMLImageElement) {
          element.style.height = "auto";
        }
      }
    }
    return true;
  }

  function loadChanges() {
    const pageChanges = readAllChanges()[getPageKey()] || [];
    pageChanges.forEach(applyChange);

    if (!changesObserver && document.body) {
      changesObserver = new MutationObserver(() => {
        const latestChanges = readAllChanges()[getPageKey()] || [];
        latestChanges.forEach(applyChange);
      });
      changesObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function saveChanges() {
    if (selectedElement && selectedElement.isContentEditable) {
      stageChange(selectedElement, "innerHTML", selectedElement.innerHTML);
    }

    const allChanges = readAllChanges();
    const pageKey = getPageKey();
    const merged = new Map();

    (allChanges[pageKey] || []).forEach((change) => {
      merged.set(`${change.selector}::${change.property}`, change);
    });
    pendingChanges.forEach((change, key) => merged.set(key, change));

    allChanges[pageKey] = Array.from(merged.values());
    try {
      localStorage.setItem(CHANGES_STORAGE_KEY, JSON.stringify(allChanges));
      pendingChanges.clear();
      setStatus("Изменения сохранены");
    } catch (error) {
      console.error("Admin Panel: не удалось сохранить изменения.", error);
      setStatus("Ошибка сохранения");
    }
  }

  function checkAdminTrigger(inputValue) {
    const digits = String(inputValue || "").replace(/\D/g, "");
    if (digits !== SECRET_CODE) return false;
    try {
      localStorage.setItem(ADMIN_STORAGE_KEY, "true");
    } catch (error) {
      console.error("Admin Panel: localStorage недоступен.", error);
      return false;
    }
    return true;
  }

  function activateAdmin() {
    const url = new URL(window.location.href);
    url.searchParams.set("admin", "true");
    window.location.replace(url.toString());
  }

  function exitAdminMode() {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("admin");
    window.location.replace(url.toString());
  }

  function hasDirectText(element) {
    return Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
  }

  function findTextElement(target) {
    let current = target instanceof Element ? target : target.parentElement;
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

    if (isText) {
      const style = getComputedStyle(selectedElement);
      const familySelect = panel.querySelector("[data-admin-font]");
      const matchingOption = Array.from(familySelect.options).find((option) =>
        style.fontFamily.toLowerCase().includes(option.value.toLowerCase().replace(/[\"']/g, ""))
      );
      if (matchingOption) familySelect.value = matchingOption.value;
      panel.querySelector("[data-admin-color]").value = colorToHex(style.color);
    }
  }

  function selectElement(element) {
    if (selectedElement && selectedElement !== element) {
      selectedElement.classList.remove("admin-panel-selected");
      if (selectedElement.isContentEditable) selectedElement.removeAttribute("contenteditable");
    }

    selectedElement = element;
    selectedElement.classList.add("admin-panel-selected");
    if (!(selectedElement instanceof HTMLImageElement)) {
      selectedElement.setAttribute("contenteditable", "true");
      selectedElement.setAttribute("spellcheck", "true");
      selectedElement.focus({ preventScroll: true });
    }
    updatePanelState();
  }

  function changeFontSize(delta) {
    if (!selectedElement || selectedElement instanceof HTMLImageElement) return;
    const currentSize = parseFloat(getComputedStyle(selectedElement).fontSize) || 16;
    const nextSize = Math.max(8, Math.min(160, currentSize + delta));
    selectedElement.style.fontSize = `${nextSize}px`;
    stageChange(selectedElement, "fontSize", selectedElement.style.fontSize);
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
  }

  function initAdminPanel() {
    if (document.getElementById("admin-panel")) return;
    if (localStorage.getItem(ADMIN_STORAGE_KEY) !== "true") return;

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
        <button type="button" data-admin-font-size="2" data-text-control disabled aria-label="Увеличить размер шрифта">+</button>
      </span>
      <label class="admin-panel-field">Цвет текста:
        <input type="color" value="#111111" data-admin-color data-text-control disabled aria-label="Цвет текста" />
      </label>
      <span class="admin-panel-field">Фото:
        <button type="button" data-admin-image-size="-10" data-image-control disabled aria-label="Уменьшить фото">−</button>
        <button type="button" data-admin-image-size="10" data-image-control disabled aria-label="Увеличить фото">+</button>
      </span>
      <button class="admin-panel-save" type="button" data-admin-save>💾 Сохранить</button>
      <button class="admin-panel-exit" type="button" data-admin-exit aria-label="Выйти из режима администратора">❌</button>
      <span class="admin-panel-status" data-admin-status aria-live="polite"></span>
    `;
    document.body.appendChild(panel);

    panel.querySelector("[data-admin-font]").addEventListener("change", (event) => {
      if (!selectedElement || selectedElement instanceof HTMLImageElement) return;
      selectedElement.style.fontFamily = event.target.value;
      stageChange(selectedElement, "fontFamily", event.target.value);
    });
    panel.querySelector("[data-admin-color]").addEventListener("input", (event) => {
      if (!selectedElement || selectedElement instanceof HTMLImageElement) return;
      selectedElement.style.color = event.target.value;
      stageChange(selectedElement, "color", event.target.value);
    });
    panel.querySelectorAll("[data-admin-font-size]").forEach((button) => {
      button.addEventListener("click", () => changeFontSize(Number(button.dataset.adminFontSize)));
    });
    panel.querySelectorAll("[data-admin-image-size]").forEach((button) => {
      button.addEventListener("click", () => changeImageSize(Number(button.dataset.adminImageSize)));
    });
    panel.querySelector("[data-admin-save]").addEventListener("click", saveChanges);
    panel.querySelector("[data-admin-exit]").addEventListener("click", exitAdminMode);

    document.addEventListener("click", (event) => {
      if (event.target.closest("#admin-panel")) return;
      const image = event.target.closest("img");
      const textElement = image ? null : findTextElement(event.target);
      if (!image && !textElement) return;
      event.preventDefault();
      event.stopPropagation();
      selectElement(image || textElement);
    }, true);

    document.addEventListener("input", (event) => {
      if (event.target === selectedElement && selectedElement.isContentEditable) {
        stageChange(selectedElement, "innerHTML", selectedElement.innerHTML);
      }
    });
  }

  function tryAdminLogin(form, event) {
    if (!(form instanceof HTMLFormElement)) return false;
    const phoneField = form.querySelector('input[type="tel"], input[name="Телефон"], input[name*="phone" i]');
    if (!phoneField || !checkAdminTrigger(phoneField.value)) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    activateAdmin();
    return true;
  }

  // Submit covers normal and React forms. Click runs even when native required-field
  // validation would prevent the browser from firing a submit event.
  document.addEventListener("submit", (event) => {
    tryAdminLogin(event.target, event);
  }, true);

  document.addEventListener("click", (event) => {
    const submitControl = event.target.closest('button[type="submit"], input[type="submit"]');
    if (!submitControl) return;
    tryAdminLogin(submitControl.form || submitControl.closest("form"), event);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    const form = event.target.form;
    if (!form || !form.contains(event.target)) return;
    tryAdminLogin(form, event);
  }, true);

  window.checkAdminTrigger = checkAdminTrigger;
  window.activateAdmin = activateAdmin;
  window.initAdminPanel = initAdminPanel;
  window.saveChanges = saveChanges;
  window.loadChanges = loadChanges;
  window.generateSelector = generateSelector;
  window.exitAdminMode = exitAdminMode;

  function boot() {
    loadChanges();
    initAdminPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
