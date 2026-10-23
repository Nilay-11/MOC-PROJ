"""
Reproduces every number in the report and on the website.

    python evaluate.py          -> results/results.json and results/results.md
"""

import itertools
import json
import random
import re
import time
from pathlib import Path

from phishing_detector import analyse, compile_regex, PATTERNS
from phishing_detector.automata import URL_CHARS
from phishing_detector.detector import KEYWORDS

random.seed(2026)
OUT = Path(__file__).parent / "results"
OUT.mkdir(exist_ok=True)

UNION = ".*(" + "|".join(KEYWORDS) + ").*"

# Illustrative test set written by the team. "phish" URLs use invented or
# reserved domains; they imitate common phishing structures, not live sites.
EXAMPLES = [
    ("https://www.google.com/", "benign"),
    ("https://github.com/nilay-11", "benign"),
    ("https://en.wikipedia.org/wiki/Finite-state_machine", "benign"),
    ("https://vit.ac.in/academics", "benign"),
    ("https://docs.python.org/3/library/re.html", "benign"),
    ("https://www.amazon.in/gp/cart/view.html", "benign"),
    ("https://stackoverflow.com/questions/tagged/regex", "benign"),
    ("https://news.ycombinator.com/item?id=1", "benign"),
    ("https://accounts.google.com/signin", "benign"),
    ("https://www.icicibank.com/", "benign"),
    ("http://login.example.com/verify-account", "phish"),
    ("http://login-example.com/verify", "phish"),
    ("http://192.168.10.5/secure/bank/login.php", "phish"),
    ("http://mybank.com@203.0.113.7/confirm", "phish"),
    ("http://secure-update.mybank.verify.example.net/account/login", "phish"),
    ("https://mybank.example-secure-login.xyz/password/reset?user=abc&token=xyz&step=2&ref=mail", "phish"),
    ("http://xn--mybnk-9qa.example/signin", "phish"),
    ("http://198.51.100.23/~user/account_update.html", "phish"),
    ("https://example.org//redirect//login.mybank.example/", "phish"),
    ("http://update.mybank.com.account-verify.example.ru/confirm", "phish"),
    ("http://bit.ly/3xYzAbc", "phish"),
    ("https://mybank-support.example.top/help", "phish"),
]


def sizes():
    rows = []
    for p in PATTERNS:
        c = compile_regex(p.regex)
        rows.append(_size_row(p.id, p.regex, c))
    rows.append(_size_row("union_keywords", UNION, compile_regex(UNION)))
    return rows


def _size_row(pid, regex, c):
    return {
        "id": pid, "regex": regex, "symbol_classes": len(c.classes),
        "nfa_states": c.nfa.n_states, "nfa_edges": len(c.nfa.edges), "nfa_eps": c.nfa.n_eps,
        "subset_dfa_states": len(c.subset_dfa.states), "min_dfa_states": len(c.min_dfa.states),
        "refinement_rounds": len(c.rounds),
        "min_dfa_has_dead_state": bool(c.min_dfa.dead_states()),
    }


def random_string(regex_chars, n):
    pool = list(URL_CHARS)
    return "".join(random.choice(regex_chars) if random.random() < 0.6 else random.choice(pool)
                   for _ in range(n))


def equivalence(samples=20000):
    """Compare each minimal DFA with Python's re engine on the same inputs."""
    out = []
    regexes = [(p.id, p.regex) for p in PATTERNS] + [("union_keywords", UNION)]
    for pid, regex in regexes:
        c = compile_regex(regex)
        dfa = c.min_dfa
        py = re.compile(regex, re.S)
        literal = [ch for ch in regex if ch in URL_CHARS and ch not in ".*+?|()[]\\"] or list("0123456789.")
        if "0-9" in regex:
            literal += list("0123456789...")
        agree = accepted = 0
        for _ in range(samples):
            s = random_string(literal, random.randint(0, 40))
            a, b = dfa.accepts(s), bool(py.fullmatch(s))
            agree += a == b
            accepted += a
        # exhaustive check over one representative per symbol class
        reps = [sorted(cls - {"⊥"})[0] if cls - {"⊥"} else "⊥" for cls in c.classes]
        reps = [r for r in reps if r != "⊥"]
        L = 1
        while len(reps) ** (L + 1) <= 300000:
            L += 1
        ex_total = ex_agree = 0
        for n in range(L + 1):
            for t in itertools.product(reps, repeat=n):
                s = "".join(t)
                ex_total += 1
                ex_agree += dfa.accepts(s) == bool(py.fullmatch(s))
        out.append({"id": pid, "random_samples": samples, "random_agree": agree,
                    "random_accepted": accepted, "exhaustive_max_len": L,
                    "exhaustive_strings": ex_total, "exhaustive_agree": ex_agree})
    return out


def examples():
    rows = []
    for url, label in EXAMPLES:
        a = analyse(url)
        rows.append({
            "url": url, "label": label, "score": a["score"],
            "classification": a["classification"],
            "flagged": a["classification"] != "Low Risk",
            "indicators": [f["id"] for f in a["findings"] if f["detected"]],
        })
    tp = sum(r["flagged"] and r["label"] == "phish" for r in rows)
    fn = sum(not r["flagged"] and r["label"] == "phish" for r in rows)
    fp = sum(r["flagged"] and r["label"] == "benign" for r in rows)
    tn = sum(not r["flagged"] and r["label"] == "benign" for r in rows)
    return rows, {"tp": tp, "fn": fn, "fp": fp, "tn": tn}


def timing():
    dfa = compile_regex(".*login.*").min_dfa
    lengths = [1000, 2000, 4000, 8000, 16000]
    series = []
    for n in lengths:
        s = random_string(list("login"), n)
        best = min(_t(lambda: dfa.accepts(s)) for _ in range(5))
        series.append({"length": n, "ms": round(best * 1000, 3),
                       "us_per_char": round(best * 1e6 / n, 3)})
    urls = [u for u, _ in EXAMPLES]
    t0 = time.perf_counter()
    reps = 50
    for _ in range(reps):
        for u in urls:
            analyse(u)
    per_url = (time.perf_counter() - t0) / (reps * len(urls))
    return {"dfa_scan": series, "analyse_ms_per_url": round(per_url * 1000, 3),
            "patterns_per_url": len(PATTERNS)}


def _t(fn):
    t0 = time.perf_counter()
    fn()
    return time.perf_counter() - t0


def main():
    for p in PATTERNS:                      # warm the compile cache
        analyse("http://warm.up/")
        break
    s = sizes()
    eq = equivalence()
    ex, cm = examples()
    tm = timing()
    data = {"sizes": s, "equivalence": eq, "examples": ex, "confusion": cm, "timing": tm}
    (OUT / "results.json").write_text(json.dumps(data, indent=2, ensure_ascii=False))

    md = ["# Evaluation results\n", "## Automaton sizes\n",
          "| Pattern | Regex | Σ classes | NFA states | ε-edges | Subset DFA | Minimal DFA |",
          "|---|---|---|---|---|---|---|"]
    for r in s:
        md.append(f"| {r['id']} | `{r['regex']}` | {r['symbol_classes']} | {r['nfa_states']} | "
                  f"{r['nfa_eps']} | {r['subset_dfa_states']} | {r['min_dfa_states']} |")
    md += ["\n## DFA vs Python `re` equivalence\n",
           "| Pattern | Random agree | Exhaustive (len ≤ L) agree |", "|---|---|---|"]
    for r in eq:
        md.append(f"| {r['id']} | {r['random_agree']}/{r['random_samples']} | "
                  f"{r['exhaustive_agree']}/{r['exhaustive_strings']} (L={r['exhaustive_max_len']}) |")
    md += ["\n## Illustrative URL set\n", "| URL | Label | Score | Class | Indicators |",
           "|---|---|---|---|---|"]
    for r in ex:
        md.append(f"| `{r['url']}` | {r['label']} | {r['score']} | {r['classification']} | "
                  f"{', '.join(r['indicators']) or '—'} |")
    md.append(f"\nConfusion (flagged = Suspicious or High): {cm}\n")
    md += ["## Timing\n", f"analyse(): {tm['analyse_ms_per_url']} ms per URL "
           f"({tm['patterns_per_url']} DFAs + 3 rules)\n",
           "| Input length | DFA scan (ms) | µs per char |", "|---|---|---|"]
    for r in tm["dfa_scan"]:
        md.append(f"| {r['length']} | {r['ms']} | {r['us_per_char']} |")
    (OUT / "results.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
