(() => {
  const header = document.querySelector(".header");
  const menuToggle = document.querySelector(".menu-toggle");
  const menuBackdrop = document.querySelector(".menu-backdrop");
  const navigationLinks = Array.from(document.querySelectorAll(".nav a"));

  if (!header || !menuToggle || !menuBackdrop) return;

  function setMenuOpen(isOpen) {
    header.classList.toggle("is-menu-open", isOpen);
    document.body.classList.toggle("menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
  }

  menuToggle.addEventListener("click", () => {
    setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
  });
  menuBackdrop.addEventListener("click", () => setMenuOpen(false));
  navigationLinks.forEach((link) => link.addEventListener("click", () => setMenuOpen(false)));
  window.addEventListener("resize", () => {
    if (window.innerWidth > 620) setMenuOpen(false);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
    }
  });
})();
