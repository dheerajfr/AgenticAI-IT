import os

file_path = r'c:\Users\2862049\Desktop\ITDELIVERY\AgenticAI-IT\apps\shell\shell.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

interceptor_code = """
// --- Global Fetch Interceptor for Loading Overlay ---
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0] || '';
  const options = args[1] || {};
  
  // Do not show loader for basic GET requests to fetch lists (prevents flickering on navigation)
  const isBackgroundSync = (typeof url === 'string' && url.includes('/api/') && (!options.method || options.method.toUpperCase() === 'GET'));
  
  // Show loader for POST, PUT, DELETE, etc (AI generations, form submits)
  if (!isBackgroundSync) {
    if (window.showGlobalLoader) {
      window.showGlobalLoader("Processing AI request...");
    }
  }
  
  try {
    const response = await originalFetch(...args);
    return response;
  } finally {
    if (!isBackgroundSync) {
      if (window.hideGlobalLoader) window.hideGlobalLoader();
    }
  }
};
"""

if "Global Fetch Interceptor" not in content:
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write("\n" + interceptor_code)
    print("Added fetch interceptor to shell.js")
else:
    print("Fetch interceptor already exists")
