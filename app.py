"""
Flask back end. The website also runs fully in the browser (it ships a
JavaScript port of the same engine), so this server is optional: it serves the
page and exposes the Python engine as a JSON API.

    pip install flask
    python app.py            -> http://127.0.0.1:5000
"""

from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

from phishing_detector import PATTERNS, analyse, compile_regex
from phishing_detector.automata import RegexError

SITE = Path(__file__).parent / "website"
app = Flask(__name__)


@app.get("/")
def index():
    return send_from_directory(SITE, "index.html")


@app.post("/api/analyze")
def api_analyze():
    url = (request.get_json(silent=True) or {}).get("url", "").strip()
    if not url:
        return jsonify(error="Send a JSON body like {\"url\": \"http://...\"}"), 400
    return jsonify(analyse(url))


@app.get("/api/automaton/<pattern_id>")
def api_automaton(pattern_id):
    p = next((p for p in PATTERNS if p.id == pattern_id), None)
    if p is None:
        abort(404)
    return jsonify(_describe(compile_regex(p.regex)))


@app.post("/api/compile")
def api_compile():
    regex = (request.get_json(silent=True) or {}).get("regex", "")
    try:
        return jsonify(_describe(compile_regex(regex)))
    except RegexError as e:
        return jsonify(error=str(e)), 400


def _describe(c):
    m = c.min_dfa
    return {
        "regex": c.regex,
        "alphabet": m.labels,
        "nfa": {"states": c.nfa.n_states, "start": c.nfa.start, "accept": c.nfa.accept,
                "edges": [[a, "ε" if s is None else m.labels[s], b] for a, s, b in c.nfa.edges]},
        "subset_construction": [
            {"dfa_state": f"D{r.index}", "nfa_states": sorted(r.nfa_states),
             "accepting": r.accepting, "on": {m.labels[i]: f"D{t}" for i, t in enumerate(r.targets)}}
            for r in c.subset_rows],
        "minimisation_rounds": c.rounds,
        "dfa": {"states": m.states, "start": m.states[m.start],
                "accepting": [m.states[q] for q in sorted(m.accepting)],
                "table": m.transition_table()},
    }


if __name__ == "__main__":
    app.run(debug=True)
