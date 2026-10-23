# PhishDFA: Rule-Based Phishing URL Detector Using Finite Automata

MOC (Models of Computation) mini project by **Nilay Sengupta (25BYB0255)** and **Adwit Agarwal (25BYB0116)**.

Every suspicious URL pattern is written as a regular expression and compiled by the textbook pipeline

    regular expression → NFA (ε-moves) → DFA (subset construction) → minimal DFA (partition refinement)

The 13 minimal DFAs read the URL one character at a time. Their verdicts, together with 3 structural rules, give a risk score: 0–1 Low Risk, 2–3 Suspicious, ≥ 4 High Risk.

| Path | What it is |
|---|---|
| `phishing_detector/automata.py` | Regex parser, alphabet compression, regex → NFA, subset construction, minimisation, `DFA` class |
| `phishing_detector/detector.py` | URL parser, pattern catalogue, structural rules, scoring |
| `website/index.html` | Showcase website (self-contained; runs a JavaScript port of the same engine) |
| `app.py` | Flask server + JSON API (`/api/analyze`, `/api/automaton/<id>`, `/api/compile`) |
| `evaluate.py` | Reproduces all results → `results/results.json`, `results/results.md` |
| `report/MOC_Project_Report_Phishing_URL_Detector.docx` / `.pdf` | Project report in the course format |
| `tests/` | 17 unit tests |

```bash
pip install flask pytest
python -m pytest tests        # run the tests
python evaluate.py            # regenerate results
python build_site.py          # inject results into the website
python app.py                 # http://127.0.0.1:5000
node report/build_report.js   # rebuild the report (needs the `docx` npm package)
```

You can also open `website/index.html` directly in a browser, with no server.
