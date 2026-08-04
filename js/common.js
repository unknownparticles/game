(function () {
  function goHome() {
    const fromGame = location.pathname.includes("/games/");
    location.href = fromGame ? "../../index.html" : "index.html";
  }

  window.GameCenter = {
    goHome,
    bindBackButtons() {
      document.querySelectorAll("[data-back-home]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.preventDefault();
          goHome();
        });
      });
    },
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
    storage: {
      get(key, fallback) {
        try {
          const raw = localStorage.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (_) {
          return fallback;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch (_) {
          /* ignore quota / private mode */
        }
      },
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.GameCenter.bindBackButtons();
  });
})();
