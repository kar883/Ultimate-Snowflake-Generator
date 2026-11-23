import importlib
import json
from pathlib import Path
import re
import sys
import tomllib
import types


registered = []
orca = types.ModuleType("orca")
orca.pages = types.SimpleNamespace(PagesPluginCapabilityBase=type("Page", (), {}))
orca.base = type("Plugin", (), {})
orca.plugin = lambda cls: cls
orca.register_capability = registered.append
sys.modules["orca"] = orca

plugin_path = Path(sys.argv[1]).resolve()
assert plugin_path.stem.isidentifier(), "OrcaSlicer imports the file stem as a Python module"
sys.path.insert(0, str(plugin_path.parent))
plugin = vars(importlib.import_module(plugin_path.stem))
plugin["SnowflakePlugin"]().register_capabilities()
assert registered == [plugin["SnowflakePage"]]
page = registered[0]()
metadata_match = re.search(
    r"(?m)^# /// script\n(.*?)^# ///\s*$",
    plugin_path.read_text(encoding="utf-8"),
    re.DOTALL,
)
assert metadata_match is not None
metadata = tomllib.loads("\n".join(
    line[2:] if line.startswith("# ") else ""
    for line in metadata_match.group(1).splitlines()
))
assert "import them into OrcaSlicer" in metadata["tool"]["orcaslicer"]["plugin"]["description"]
assert page.has_config_ui() is True
config_html = page.get_config_ui()
assert "no settings in this dialog" in config_html
assert "Settings &amp; Shortcuts" in config_html
messages = []
page.post_message = messages.append

for index in range(len(plugin["_CHUNKS"])):
    page.on_message({"type": "snowflake-bundle-chunk", "index": index})
    assert messages[-1] == {
        "type": "snowflake-bundle-chunk",
        "index": index,
        "count": len(plugin["_CHUNKS"]),
        "data": plugin["_CHUNKS"][index],
    }

for invalid in (-1, len(plugin["_CHUNKS"]), True, "0"):
    try:
        page.on_message({"type": "snowflake-bundle-chunk", "index": invalid})
    except ValueError:
        pass
    else:
        raise AssertionError(f"Invalid index accepted: {invalid!r}")

print(json.dumps({"html": page.get_ui(), "configHtml": config_html, "chunks": messages}))
