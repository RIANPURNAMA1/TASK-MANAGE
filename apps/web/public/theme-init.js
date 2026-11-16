// Applies the saved theme before the app renders, so dark mode doesn't flash light first.
// Kept as an external file because the desktop CSP forbids inline scripts.
// Must use the same storage key and logic as src/stores/theme.ts.
(function () {
  var mode = 'system';
  try {
    mode = localStorage.getItem('nexus-theme') || 'system';
  } catch (e) {}
  var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
})();
