# /// script
# dependencies = []
#
# [tool.orcaslicer.plugin]
# name = "Ultimate Snowflake Generator"
# description = "Design customizable 2D and 3D snowflakes in an OrcaSlicer tab using text, shapes, artwork, and interlocking planes. Export STL or 3MF files and import them into OrcaSlicer for slicing. Save and reopen designs as project JSON files."
# author = "Snowflake Generator Contributors"
# version = "__VERSION__"
# ///

import base64
import gzip

import orca

_DATA = gzip.decompress(base64.b64decode("__BUNDLE__")).decode("ascii")
_CHUNK_SIZE = 32768
_CHUNKS = [_DATA[i:i + _CHUNK_SIZE] for i in range(0, len(_DATA), _CHUNK_SIZE)]

_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ultimate Snowflake Generator</title>
</head>
<body>
  <div id="root"></div>
  <p id="orca-loading">Loading Ultimate Snowflake Generator...</p>
  <script>
    (() => {
      const loading = document.getElementById('orca-loading');
      const parts = [];
      let timeout;
      function fail(message) {
        clearTimeout(timeout);
        loading.textContent = message;
        console.error(message);
      }
      function request(index) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fail('The OrcaSlicer plugin did not respond. Reload the page or check the OrcaSlicer logs.'), 15000);
        window.orca.postMessage({ type: 'snowflake-bundle-chunk', index });
      }
      if (!window.orca || typeof window.orca.onMessage !== 'function') {
        fail('The OrcaSlicer Pages bridge is unavailable.');
        return;
      }
      window.orca.onMessage((message) => {
        if (!message || message.type !== 'snowflake-bundle-chunk') return;
        if (message.index !== parts.length || !Number.isInteger(message.count) || message.count < 1 || typeof message.data !== 'string') {
          fail('The OrcaSlicer plugin returned an invalid application bundle.');
          return;
        }
        parts.push(message.data);
        if (parts.length < message.count) {
          request(parts.length);
          return;
        }
        clearTimeout(timeout);
        try {
          const bytes = Uint8Array.from(atob(parts.join('')), c => c.charCodeAt(0));
          const bundle = JSON.parse(new TextDecoder().decode(bytes));
          const style = document.createElement('style');
          style.textContent = bundle.css;
          document.head.appendChild(style);
          const url = URL.createObjectURL(new Blob([bundle.js], { type: 'text/javascript' }));
          import(url).then(() => {
            URL.revokeObjectURL(url);
            loading.remove();
          }).catch(error => {
            URL.revokeObjectURL(url);
            fail('Could not start Ultimate Snowflake Generator: ' + error.message);
          });
        } catch (error) {
          fail('Could not load Ultimate Snowflake Generator: ' + error.message);
        }
      });
      request(0);
    })();
  </script>
</body>
</html>"""

_CONFIG_UI = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: var(--orca-bg, #fff);
      color: var(--orca-fg, #222);
      font: 14px/1.5 var(--orca-font, sans-serif);
    }
    h2 { margin: 0 0 8px; font-size: 17px; }
    h3 { margin: 18px 0 4px; font-size: 14px; }
    p { margin: 4px 0; }
  </style>
</head>
<body>
  <h2>Snowflake Generator configuration</h2>
  <p>This plugin has no settings in this dialog. Open the Snowflake Generator tab to configure your design.</p>
  <h3>App settings and projects</h3>
  <p>Use Settings &amp; Shortcuts in the app for preferences, startup defaults, and the optional Gemini API key.
  Use Save and Load to keep or reopen a project JSON file. Save before reloading the tab.</p>
  <h3>Exporting to OrcaSlicer</h3>
  <p>Export an STL or 3MF file in the app, then import it into OrcaSlicer. The plugin does not add models directly to the plate.</p>
  <h3>Internet and permissions</h3>
  <p>The Python plugin requests no special permissions. Online fonts and optional AI features use the embedded browser's network access.
  System-font access, downloads, and browser storage depend on the webview and operating system.</p>
</body>
</html>"""


class SnowflakePage(orca.pages.PagesPluginCapabilityBase):
    def get_name(self):
        return "Snowflake Generator"

    def get_ui(self):
        return _PAGE

    def has_config_ui(self):
        return True

    def get_config_ui(self):
        return _CONFIG_UI

    def on_message(self, data):
        if not isinstance(data, dict) or data.get("type") != "snowflake-bundle-chunk":
            raise ValueError("Unsupported Snowflake Generator message")
        index = data.get("index")
        if type(index) is not int or not 0 <= index < len(_CHUNKS):
            raise ValueError("Invalid Snowflake Generator bundle chunk index")
        self.post_message({
            "type": "snowflake-bundle-chunk",
            "index": index,
            "count": len(_CHUNKS),
            "data": _CHUNKS[index],
        })


@orca.plugin
class SnowflakePlugin(orca.base):
    def register_capabilities(self):
        orca.register_capability(SnowflakePage)
