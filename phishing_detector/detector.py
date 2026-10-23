"""
Rule-based phishing URL detector.

Module 1  URL parser            -> parse_url()
Module 2  MOC automata engine   -> automata.py (one minimal DFA per pattern)
Module 3  feature detector      -> analyse()  (DFA results + structural rules + score)
Module 4  web interface         -> app.py / website/index.html
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from .automata import compile_regex

# --------------------------------------------------------------------------- #
# Pattern catalogue. Each pattern is a regular language recognised by its own
# minimal DFA. `scope` says which URL component the DFA reads.
# --------------------------------------------------------------------------- #

KEYWORDS = ["login", "signin", "verify", "account", "password",
            "secure", "update", "bank", "confirm"]


@dataclass(frozen=True)
class Pattern:
    id: str
    title: str
    regex: str
    scope: str        # 'url' | 'host' | 'path'
    weight: int
    category: str


PATTERNS: list[Pattern] = [
    *[Pattern(f"kw_{k}", f"Keyword “{k}”", f".*{k}.*", "url", 1, "keyword") for k in KEYWORDS],
    Pattern("at_symbol", "“@” symbol in URL", ".*@.*", "url", 2, "structure"),
    Pattern("ipv4_host", "IPv4 address as hostname",
            r"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+", "host", 2, "structure"),
    Pattern("punycode", "Punycode host (xn--)", ".*xn--.*", "host", 1, "structure"),
    Pattern("dbl_slash", "“//” redirect inside path", ".*//.*", "path", 1, "structure"),
]

LONG_URL = 75          # characters
MAX_HOST_LABELS = 3    # more labels than this = "many subdomain levels"
MAX_SPECIAL = 6        # more of - _ = & % ~ than this = "excessive special characters"
SPECIAL_CHARS = set("-_=&%~")


@lru_cache(maxsize=None)
def compiled(pattern_id: str):
    p = next(p for p in PATTERNS if p.id == pattern_id)
    return compile_regex(p.regex)


# --------------------------------------------------------------------------- #
# Module 1: URL parser / component extraction
# --------------------------------------------------------------------------- #

@dataclass
class URLParts:
    raw: str
    normalised: str
    scheme: str
    userinfo: str
    host: str
    port: str
    path: str
    query: str
    fragment: str

    @property
    def labels(self) -> list[str]:
        return [x for x in self.host.split(".") if x]

    @property
    def registered_domain(self) -> str:
        return ".".join(self.labels[-2:])

    @property
    def subdomain(self) -> str:
        return ".".join(self.labels[:-2])


def parse_url(raw: str) -> URLParts:
    url = raw.strip()
    norm = url.lower()
    rest = norm
    scheme = ""
    if "://" in rest:
        scheme, rest = rest.split("://", 1)
    cut = len(rest)
    for sep in "/?#":
        i = rest.find(sep)
        if i != -1:
            cut = min(cut, i)
    authority, tail = rest[:cut], rest[cut:]
    userinfo = ""
    if "@" in authority:                       # the real host is after the LAST '@'
        userinfo, authority = authority.rsplit("@", 1)
    host, port = authority, ""
    if ":" in authority:
        host, port = authority.rsplit(":", 1)
    fragment = ""
    if "#" in tail:
        tail, fragment = tail.split("#", 1)
    query = ""
    if "?" in tail:
        tail, query = tail.split("?", 1)
    return URLParts(url, norm, scheme, userinfo, host, port, tail, query, fragment)


# --------------------------------------------------------------------------- #
# Module 3: detection + scoring
# --------------------------------------------------------------------------- #

def classify(score: int) -> str:
    if score <= 1:
        return "Low Risk"
    if score <= 3:
        return "Suspicious"
    return "High Risk"


def _scope_text(parts: URLParts, scope: str) -> str:
    if scope == "host":
        return parts.host
    if scope == "path":
        return parts.path
    return parts.normalised


def analyse(raw: str) -> dict:
    parts = parse_url(raw)
    findings = []
    for p in PATTERNS:
        text = _scope_text(parts, p.scope)
        dfa = compiled(p.id).min_dfa
        trace = dfa.run(text)
        hit = trace[-1] in dfa.accepting
        findings.append({
            "id": p.id, "title": p.title, "kind": "dfa", "category": p.category,
            "regex": p.regex, "scope": p.scope, "input": text,
            "final_state": dfa.states[trace[-1]], "detected": hit,
            "weight": p.weight if hit else 0,
        })

    n_special = sum(1 for c in parts.normalised if c in SPECIAL_CHARS)
    host_is_ip = any(f["id"] == "ipv4_host" and f["detected"] for f in findings)
    rules = [
        ("long_url", f"URL longer than {LONG_URL} characters",
         len(parts.normalised) > LONG_URL, f"{len(parts.normalised)} characters"),
        ("many_subdomains", f"More than {MAX_HOST_LABELS} hostname labels",
         len(parts.labels) > MAX_HOST_LABELS and not host_is_ip,
         "IP host, not counted" if host_is_ip else f"{len(parts.labels)} labels"),
        ("special_chars", f"More than {MAX_SPECIAL} special characters (- _ = & % ~)",
         n_special > MAX_SPECIAL, f"{n_special} found"),
    ]
    for rid, title, hit, detail in rules:
        findings.append({"id": rid, "title": title, "kind": "rule", "category": "structure",
                         "detected": hit, "detail": detail, "weight": 1 if hit else 0})

    score = sum(f["weight"] for f in findings)
    return {
        "url": raw,
        "components": {
            "scheme": parts.scheme, "userinfo": parts.userinfo, "host": parts.host,
            "subdomain": parts.subdomain, "domain": parts.registered_domain,
            "port": parts.port, "path": parts.path, "query": parts.query,
            "fragment": parts.fragment,
        },
        "findings": findings,
        "score": score,
        "classification": classify(score),
    }
