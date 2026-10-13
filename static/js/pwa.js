// PWA — enregistrement du service worker + bannière d'installation

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/static/sw.js").catch(() => {});
  });
}

let deferredPrompt = null;
const banner = document.getElementById("installBanner");
const installBtn = document.getElementById("installBtn");
const installClose = document.getElementById("installClose");

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone() && !sessionStorage.getItem("installBannerDismissed")) {
    banner.classList.add("show");
  }
});

installBtn?.addEventListener("click", async () => {
  banner.classList.remove("show");
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
});

installClose?.addEventListener("click", () => {
  banner.classList.remove("show");
  sessionStorage.setItem("installBannerDismissed", "1");
});

window.addEventListener("appinstalled", () => {
  banner.classList.remove("show");
});
