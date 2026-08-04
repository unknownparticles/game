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
    bump(el) {
      if (!el) return;
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    },
    flashStatus(el, type, text) {
      if (!el) return;
      if (text != null) el.textContent = text;
      el.classList.remove("success-anim", "fail-anim");
      void el.offsetWidth;
      el.classList.add(type === "success" ? "success-anim" : "fail-anim");
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.GameCenter.bindBackButtons();
  });
})();
