"""
MOC automata engine.

Pipeline used for every suspicious pattern in the detector:

    regular expression --> NFA (with epsilon-moves) --(subset construction)--> DFA
                       --(Moore partition refinement)--> minimal DFA

Every automaton works over the URL alphabet SIGMA. Because SIGMA has 60
symbols, the alphabet is compressed into *symbol classes*: characters that no
part of the regular expression can tell apart share one class (for the pattern
"login", every character other than l, o, g, i, n behaves identically). This is
the standard character-class technique used by lexer generators; it changes
the size of the transition table, not the language that is recognised.
"""

from __future__ import annotations

import string
from collections import deque
from dataclasses import dataclass, field

# --------------------------------------------------------------------------- #
# Alphabet
# --------------------------------------------------------------------------- #

# RFC 3986 characters (unreserved + reserved + '%'), lower-case letters only,
# because the input is case-normalised before it reaches the automata.
URL_CHARS = (
    string.ascii_lowercase
    + string.digits
    + "-._~:/?#[]@!$&'()*+,;=%"
)
OTHER = "⊥"  # sentinel symbol for any character outside the URL alphabet
SIGMA = frozenset(URL_CHARS) | {OTHER}


def normalise_symbol(ch: str) -> str:
    ch = ch.lower()
    return ch if ch in SIGMA else OTHER


# --------------------------------------------------------------------------- #
# Regular-expression parser (subset: literals, escapes, [..] classes, ., |,
# concatenation, *, +, ?, parentheses)
# --------------------------------------------------------------------------- #

@dataclass
class Node:
    kind: str                       # 'set' | 'cat' | 'alt' | 'star' | 'plus' | 'opt' | 'eps'
    chars: frozenset | None = None
    kids: list = field(default_factory=list)


class RegexError(ValueError):
    pass


class _Parser:
    SPECIAL = set("()[]|*+?.\\")

    def __init__(self, src: str):
        self.src = src
        self.i = 0

    def peek(self):
        return self.src[self.i] if self.i < len(self.src) else None

    def take(self):
        ch = self.peek()
        if ch is None:
            raise RegexError("unexpected end of expression")
        self.i += 1
        return ch

    def parse(self) -> Node:
        node = self.expr()
        if self.peek() is not None:
            raise RegexError(f"unexpected '{self.peek()}' at position {self.i}")
        return node

    def expr(self) -> Node:
        terms = [self.term()]
        while self.peek() == "|":
            self.take()
            terms.append(self.term())
        return terms[0] if len(terms) == 1 else Node("alt", kids=terms)

    def term(self) -> Node:
        factors = []
        while self.peek() is not None and self.peek() not in "|)":
            factors.append(self.factor())
        if not factors:
            return Node("eps")
        return factors[0] if len(factors) == 1 else Node("cat", kids=factors)

    def factor(self) -> Node:
        node = self.atom()
        while self.peek() in ("*", "+", "?"):
            op = self.take()
            node = Node({"*": "star", "+": "plus", "?": "opt"}[op], kids=[node])
        return node

    def atom(self) -> Node:
        ch = self.take()
        if ch == "(":
            node = self.expr()
            if self.take() != ")":
                raise RegexError("missing ')'")
            return node
        if ch == "[":
            return Node("set", chars=self.char_class())
        if ch == ".":
            return Node("set", chars=SIGMA)
        if ch == "\\":
            return Node("set", chars=self.escape(self.take()))
        if ch in ")]*+?|":
            raise RegexError(f"unexpected '{ch}' at position {self.i - 1}")
        return Node("set", chars=frozenset({normalise_symbol(ch)}))

    @staticmethod
    def escape(ch: str) -> frozenset:
        if ch == "d":
            return frozenset(string.digits)
        if ch == "w":
            return frozenset(string.ascii_lowercase + string.digits + "_")
        return frozenset({normalise_symbol(ch)})

    def char_class(self) -> frozenset:
        negate = False
        if self.peek() == "^":
            self.take()
            negate = True
        chars: set[str] = set()
        first = True
        while True:
            ch = self.take()
            if ch == "]" and not first:
                break
            first = False
            if ch == "\\":
                chars |= self.escape(self.take())
                continue
            if self.peek() == "-" and self.i + 1 < len(self.src) and self.src[self.i + 1] != "]":
                self.take()
                hi = self.take()
                chars |= {normalise_symbol(chr(c)) for c in range(ord(ch), ord(hi) + 1)}
            else:
                chars.add(normalise_symbol(ch))
        chars &= SIGMA
        return frozenset(SIGMA - chars) if negate else frozenset(chars)


def parse_regex(src: str) -> Node:
    return _Parser(src).parse()


# --------------------------------------------------------------------------- #
# Alphabet compression into symbol classes
# --------------------------------------------------------------------------- #

def _collect_sets(node: Node, out: list):
    if node.kind == "set":
        out.append(node.chars)
    for k in node.kids:
        _collect_sets(k, out)


def _order_key(ch: str) -> int:
    return URL_CHARS.index(ch) if ch in URL_CHARS else len(URL_CHARS)


def symbol_classes(node: Node) -> list[frozenset]:
    """Coarsest partition of SIGMA that respects every character set in the regex."""
    blocks = [SIGMA]
    sets: list[frozenset] = []
    _collect_sets(node, sets)
    for s in sets:
        nxt = []
        for b in blocks:
            inside, outside = b & s, b - s
            nxt += [x for x in (inside, outside) if x]
        blocks = nxt
    # the class holding the sentinel ("other") goes last; the rest by first character
    blocks.sort(key=lambda b: (OTHER in b, min(_order_key(c) for c in b)))
    return blocks


def class_label(chars: frozenset) -> str:
    if len(chars) == 1:
        (c,) = chars
        return "other" if c == OTHER else c
    if OTHER in chars:
        return "other"
    if chars == frozenset(string.digits):
        return "0-9"
    if chars == frozenset(string.ascii_lowercase):
        return "a-z"
    ordered = sorted(chars, key=_order_key)
    if len(ordered) <= 6:
        return "[" + "".join(ordered) + "]"
    return "[" + "".join(ordered[:5]) + "…]"


# --------------------------------------------------------------------------- #
# Regular expression -> NFA (with epsilon-moves)
# --------------------------------------------------------------------------- #

EPS = None


@dataclass
class NFA:
    n_states: int
    start: int
    accept: int
    edges: list            # (src, symbol-index | EPS, dst)
    classes: list           # list[frozenset]

    def eps_closure(self, states) -> frozenset:
        adj = self._eps_adj()
        stack, seen = list(states), set(states)
        while stack:
            s = stack.pop()
            for t in adj.get(s, ()):
                if t not in seen:
                    seen.add(t)
                    stack.append(t)
        return frozenset(seen)

    def move(self, states, sym: int) -> frozenset:
        adj = self._sym_adj()
        out = set()
        for s in states:
            out |= adj.get((s, sym), set())
        return frozenset(out)

    def _eps_adj(self):
        if not hasattr(self, "_eps"):
            self._eps = {}
            for a, sym, b in self.edges:
                if sym is EPS:
                    self._eps.setdefault(a, []).append(b)
        return self._eps

    def _sym_adj(self):
        if not hasattr(self, "_sym"):
            self._sym = {}
            for a, sym, b in self.edges:
                if sym is not EPS:
                    self._sym.setdefault((a, sym), set()).add(b)
        return self._sym

    @property
    def n_eps(self) -> int:
        return sum(1 for e in self.edges if e[1] is EPS)


def regex_to_nfa(node: Node, classes: list[frozenset]) -> NFA:
    edges: list = []
    counter = [0]

    def new() -> int:
        counter[0] += 1
        return counter[0] - 1

    def build(n: Node):
        if n.kind == "eps":
            s, f = new(), new()
            edges.append((s, EPS, f))
            return s, f
        if n.kind == "set":
            s, f = new(), new()
            for idx, cls in enumerate(classes):
                if cls <= n.chars:
                    edges.append((s, idx, f))
            return s, f
        if n.kind == "cat":
            s, f = build(n.kids[0])
            for k in n.kids[1:]:
                s2, f2 = build(k)
                edges.append((f, EPS, s2))
                f = f2
            return s, f
        if n.kind == "alt":
            s, f = new(), new()
            for k in n.kids:
                s2, f2 = build(k)
                edges.append((s, EPS, s2))
                edges.append((f2, EPS, f))
            return s, f
        if n.kind in ("star", "plus", "opt"):
            s, f = new(), new()
            s2, f2 = build(n.kids[0])
            edges.append((s, EPS, s2))
            edges.append((f2, EPS, f))
            if n.kind in ("star", "opt"):
                edges.append((s, EPS, f))
            if n.kind in ("star", "plus"):
                edges.append((f2, EPS, s2))
            return s, f
        raise ValueError(n.kind)

    s, f = build(node)
    return NFA(counter[0], s, f, edges, classes)


# --------------------------------------------------------------------------- #
# DFA
# --------------------------------------------------------------------------- #

@dataclass
class DFA:
    """M = (Q, Sigma, delta, q0, F) over compressed symbol classes."""
    states: list[str]
    classes: list[frozenset]
    delta: list[list[int]]          # delta[q][symbol-class] -> q'
    start: int
    accepting: set[int]

    def symbol_of(self, ch: str) -> int:
        ch = normalise_symbol(ch)
        for i, cls in enumerate(self.classes):
            if ch in cls:
                return i
        raise KeyError(ch)

    def step(self, q: int, ch: str) -> int:
        return self.delta[q][self.symbol_of(ch)]

    def run(self, text: str):
        """Extended transition function delta-hat, returning the full trace."""
        q = self.start
        trace = [q]
        for ch in text:
            q = self.step(q, ch)
            trace.append(q)
        return trace

    def accepts(self, text: str) -> bool:
        return self.run(text)[-1] in self.accepting

    @property
    def labels(self) -> list[str]:
        return [class_label(c) for c in self.classes]

    def dead_states(self) -> set[int]:
        return {
            q for q in range(len(self.states))
            if q not in self.accepting and all(t == q for t in self.delta[q])
        }

    def transition_table(self) -> list[list[str]]:
        head = ["state"] + self.labels
        rows = [head]
        for q, name in enumerate(self.states):
            mark = ("→" if q == self.start else "") + ("*" if q in self.accepting else "")
            rows.append([mark + name] + [self.states[t] for t in self.delta[q]])
        return rows


@dataclass
class SubsetRow:
    index: int
    nfa_states: frozenset
    accepting: bool
    targets: list[int]


def subset_construction(nfa: NFA):
    """Rabin–Scott powerset construction. The empty subset becomes the dead state."""
    start = nfa.eps_closure({nfa.start})
    index = {start: 0}
    order = [start]
    queue = deque([start])
    rows: list[SubsetRow] = []
    targets: dict[int, list[int]] = {}
    while queue:
        S = queue.popleft()
        tlist = []
        for sym in range(len(nfa.classes)):
            T = nfa.eps_closure(nfa.move(S, sym))
            if T not in index:
                index[T] = len(order)
                order.append(T)
                queue.append(T)
            tlist.append(index[T])
        targets[index[S]] = tlist
    for i, S in enumerate(order):
        rows.append(SubsetRow(i, S, nfa.accept in S, targets[i]))
    dfa = DFA(
        states=[f"D{i}" for i in range(len(order))],
        classes=nfa.classes,
        delta=[targets[i] for i in range(len(order))],
        start=0,
        accepting={i for i, S in enumerate(order) if nfa.accept in S},
    )
    return dfa, rows


def minimise(dfa: DFA):
    """Moore's partition-refinement algorithm, followed by BFS renaming.

    Returns the minimal DFA and the list of partitions, one per refinement
    round, so the algorithm can be shown step by step.
    """
    n = len(dfa.states)
    block = [1 if q in dfa.accepting else 0 for q in range(n)]
    rounds = []

    def snapshot():
        groups: dict[int, list[int]] = {}
        for q, b in enumerate(block):
            groups.setdefault(b, []).append(q)
        return sorted(groups.values())

    rounds.append(snapshot())
    while True:
        sig = {}
        new_block = []
        for q in range(n):
            key = (block[q], tuple(block[t] for t in dfa.delta[q]))
            new_block.append(sig.setdefault(key, len(sig)))
        stable = len(set(new_block)) == len(set(block))
        block = new_block
        if stable:
            break
        rounds.append(snapshot())

    # BFS renaming from the start state, so state numbers follow reading order
    start_b = block[dfa.start]
    rep = {}
    for q in range(n):
        rep.setdefault(block[q], q)
    order = [start_b]
    seen = {start_b}
    queue = deque([start_b])
    while queue:
        b = queue.popleft()
        for t in dfa.delta[rep[b]]:
            tb = block[t]
            if tb not in seen:
                seen.add(tb)
                order.append(tb)
                queue.append(tb)
    pos = {b: i for i, b in enumerate(order)}
    delta = [[pos[block[t]] for t in dfa.delta[rep[b]]] for b in order]
    accepting = {pos[block[q]] for q in dfa.accepting if block[q] in pos}
    m = DFA([""] * len(order), dfa.classes, delta, 0, accepting)

    # dead state (if any) goes last and is called qd
    dead = m.dead_states()
    live = [q for q in range(len(order)) if q not in dead]
    final_order = live + sorted(dead)
    remap = {old: new for new, old in enumerate(final_order)}
    delta = [[remap[t] for t in m.delta[old]] for old in final_order]
    names = [f"q{i}" for i in range(len(live))] + ["qd"] * len(dead)
    minimal = DFA(names, dfa.classes, delta, 0, {remap[q] for q in m.accepting})
    return minimal, rounds


@dataclass
class CompiledPattern:
    regex: str
    classes: list
    nfa: NFA
    subset_dfa: DFA
    subset_rows: list
    min_dfa: DFA
    rounds: list


def compile_regex(regex: str) -> CompiledPattern:
    tree = parse_regex(regex)
    classes = symbol_classes(tree)
    nfa = regex_to_nfa(tree, classes)
    sdfa, rows = subset_construction(nfa)
    mdfa, rounds = minimise(sdfa)
    return CompiledPattern(regex, classes, nfa, sdfa, rows, mdfa, rounds)
