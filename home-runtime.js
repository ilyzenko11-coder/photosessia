(() => {
  function initHomeRuntime() {
    document.body.classList.add("home-runtime-ready");

    const sections = Array.from(document.querySelectorAll(
      ".story-section, .practice-section, .reflection-section, .permission-section, .women-story-section, .author-intro-section"
    ));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("is-visible"));
    } else {
      sections.forEach((section) => section.classList.add("with-animation"));
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, {
        threshold: 0.08,
        rootMargin: "0px 0px -8% 0px",
      });
      sections.forEach((section) => revealObserver.observe(section));
    }

    const deferredVideos = document.querySelectorAll("video[data-deferred-video]");
    if (!deferredVideos.length) return;

    if (!("IntersectionObserver" in window)) {
      deferredVideos.forEach((video) => void video.play().catch(() => {}));
      return;
    }

    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { rootMargin: "400px 0px", threshold: 0.01 });
    deferredVideos.forEach((video) => videoObserver.observe(video));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomeRuntime, { once: true });
  } else {
    initHomeRuntime();
  }
})();
