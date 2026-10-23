"""Inject results/results.json into website/index.html (run after evaluate.py)."""
import json
import re
from pathlib import Path

root = Path(__file__).parent
data = json.loads((root / "results" / "results.json").read_text())
page = root / "website" / "index.html"
html = page.read_text()
blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
html = re.sub(r"/\*RESULTS-START\*/.*?/\*RESULTS-END\*/", lambda m: f"/*RESULTS-START*/{blob}/*RESULTS-END*/", html, flags=re.S)
page.write_text(html)
print("results injected:", len(blob), "bytes")
