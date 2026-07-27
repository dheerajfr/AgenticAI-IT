import os

file_path = r'c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell\shell.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

loader_code = """
// Global Loader Logic
window.showGlobalLoader = function(message = "Processing...") {
  let loader = document.getElementById('global-overlay-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'global-overlay-loader';
    loader.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      z-index: 100000; display: flex; flex-direction: column; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
    `;
    
    loader.innerHTML = `
      <style>
        .global-spinner {
          width: 50px; height: 50px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: var(--color-brand, #6366f1);
          animation: global-spin 1s ease-in-out infinite;
          margin-bottom: 20px;
        }
        @keyframes global-spin { to { transform: rotate(360deg); } }
        .global-loader-text {
          font-family: var(--font-sans, system-ui);
          color: white; font-size: 1.1rem; font-weight: 500;
          letter-spacing: 0.5px;
          animation: global-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes global-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      </style>
      <div class="global-spinner"></div>
      <div class="global-loader-text" id="global-loader-msg"></div>
    `;
    document.body.appendChild(loader);
  }
  
  document.getElementById('global-loader-msg').innerText = message;
  loader.style.opacity = '1';
  loader.style.pointerEvents = 'all';
};

window.hideGlobalLoader = function() {
  const loader = document.getElementById('global-overlay-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
  }
};
"""

if "window.showGlobalLoader" not in content:
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write("\n" + loader_code)
    print("Added global loader to shell.js")
else:
    print("Global loader already exists in shell.js")

