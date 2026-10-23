import re

import pytest

from phishing_detector import analyse, compile_regex, parse_url
from phishing_detector.automata import RegexError


def test_login_dfa_matches_report_diagram():
    dfa = compile_regex(".*login.*").min_dfa
    assert dfa.states == ["q0", "q1", "q2", "q3", "q4", "q5"]
    assert dfa.accepting == {5}
    assert [dfa.states[q] for q in dfa.run("login")] == ["q0", "q1", "q2", "q3", "q4", "q5"]


def test_restart_on_partial_match():
    # "lologin" needs the failure transition q2 --l--> q1, not back to q0
    assert compile_regex(".*login.*").min_dfa.accepts("lologin")
    assert not compile_regex(".*login.*").min_dfa.accepts("logi-n")


@pytest.mark.parametrize("host,ok", [
    ("192.168.0.1", True), ("10.0.0.256", True), ("1.2.3", False),
    ("1.2.3.4.5", False), ("a.b.c.d", False), ("", False),
])
def test_ipv4_dfa(host, ok):
    assert compile_regex(r"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+").min_dfa.accepts(host) is ok


@pytest.mark.parametrize("regex", ["(a|b)*abb", "a+b?c*", "[^ab]x", "(ab|a)*", "x(y|)z"])
def test_against_python_re(regex):
    dfa = compile_regex(regex).min_dfa
    py = re.compile(regex)
    import itertools
    for n in range(7):
        for t in itertools.product("abcxyz", repeat=n):
            s = "".join(t)
            assert dfa.accepts(s) == bool(py.fullmatch(s)), s


def test_minimisation_textbook_example():
    # (a|b)*abb has a 4-state minimal DFA (Aho, Sethi, Ullman)
    c = compile_regex("(a|b)*abb")
    live = [q for q in range(len(c.min_dfa.states)) if q not in c.min_dfa.dead_states()]
    assert len(live) == 4


def test_bad_regex():
    with pytest.raises(RegexError):
        compile_regex("(ab")


def test_parser_real_host_after_at():
    p = parse_url("http://mybank.com@203.0.113.7/confirm")
    assert p.userinfo == "mybank.com" and p.host == "203.0.113.7" and p.path == "/confirm"


def test_report_example_scores():
    a = analyse("http://login.example.com/verify-account")
    assert a["score"] == 3 and a["classification"] == "Suspicious"
    assert analyse("https://www.google.com/")["classification"] == "Low Risk"
