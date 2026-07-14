(() => {
  function setMenuOpen(isOpen) {
    const header = document.querySelector(".header");
    const menuToggle = document.querySelector(".menu-toggle");
    if (!header || !menuToggle) return;

    header.classList.toggle("is-menu-open", isOpen);
    document.body.classList.toggle("menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const menuToggle = event.target.closest(".menu-toggle");
    if (menuToggle) {
      setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
      return;
    }

    if (event.target.closest(".menu-backdrop") || event.target.closest(".nav a")) {
      setMenuOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 620) setMenuOpen(false);
  });
  window.addEventListener("keydown", (event) => {
    const menuToggle = document.querySelector(".menu-toggle");
    if (event.key === "Escape" && menuToggle?.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
    }
  });
})();
