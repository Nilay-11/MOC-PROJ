# Evaluation results

## Automaton sizes

| Pattern | Regex | Σ classes | NFA states | ε-edges | Subset DFA | Minimal DFA |
|---|---|---|---|---|---|---|
| kw_login | `.*login.*` | 6 | 18 | 14 | 13 | 6 |
| kw_signin | `.*signin.*` | 5 | 20 | 15 | 15 | 7 |
| kw_verify | `.*verify.*` | 7 | 20 | 15 | 15 | 7 |
| kw_account | `.*account.*` | 7 | 22 | 16 | 17 | 8 |
| kw_password | `.*password.*` | 8 | 24 | 17 | 19 | 9 |
| kw_secure | `.*secure.*` | 6 | 20 | 15 | 15 | 7 |
| kw_update | `.*update.*` | 7 | 20 | 15 | 15 | 7 |
| kw_bank | `.*bank.*` | 5 | 16 | 13 | 11 | 5 |
| kw_confirm | `.*confirm.*` | 8 | 22 | 16 | 17 | 8 |
| at_symbol | `.*@.*` | 2 | 10 | 10 | 5 | 2 |
| ipv4_host | `[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+` | 3 | 22 | 18 | 9 | 9 |
| punycode | `.*xn--.*` | 4 | 16 | 13 | 11 | 5 |
| dbl_slash | `.*//.*` | 2 | 12 | 11 | 7 | 3 |
| union_keywords | `.*(login|signin|verify|account|password|secure|update|bank|confirm).*` | 22 | 120 | 74 | 111 | 44 |

## DFA vs Python `re` equivalence

| Pattern | Random agree | Exhaustive (len ≤ L) agree |
|---|---|---|
| kw_login | 20000/20000 | 335923/335923 (L=7) |
| kw_signin | 20000/20000 | 97656/97656 (L=7) |
| kw_verify | 20000/20000 | 137257/137257 (L=6) |
| kw_account | 20000/20000 | 137257/137257 (L=6) |
| kw_password | 20000/20000 | 299593/299593 (L=6) |
| kw_secure | 20000/20000 | 335923/335923 (L=7) |
| kw_update | 20000/20000 | 137257/137257 (L=6) |
| kw_bank | 20000/20000 | 97656/97656 (L=7) |
| kw_confirm | 20000/20000 | 299593/299593 (L=6) |
| at_symbol | 20000/20000 | 524287/524287 (L=18) |
| ipv4_host | 20000/20000 | 265720/265720 (L=11) |
| punycode | 20000/20000 | 349525/349525 (L=9) |
| dbl_slash | 20000/20000 | 524287/524287 (L=18) |
| union_keywords | 20000/20000 | 245411/245411 (L=4) |

## Illustrative URL set

| URL | Label | Score | Class | Indicators |
|---|---|---|---|---|
| `https://www.google.com/` | benign | 0 | Low Risk | — |
| `https://github.com/nilay-11` | benign | 0 | Low Risk | — |
| `https://en.wikipedia.org/wiki/Finite-state_machine` | benign | 0 | Low Risk | — |
| `https://vit.ac.in/academics` | benign | 0 | Low Risk | — |
| `https://docs.python.org/3/library/re.html` | benign | 0 | Low Risk | — |
| `https://www.amazon.in/gp/cart/view.html` | benign | 0 | Low Risk | — |
| `https://stackoverflow.com/questions/tagged/regex` | benign | 0 | Low Risk | — |
| `https://news.ycombinator.com/item?id=1` | benign | 0 | Low Risk | — |
| `https://accounts.google.com/signin` | benign | 2 | Suspicious | kw_signin, kw_account |
| `https://www.icicibank.com/` | benign | 1 | Low Risk | kw_bank |
| `http://login.example.com/verify-account` | phish | 3 | Suspicious | kw_login, kw_verify, kw_account |
| `http://login-example.com/verify` | phish | 2 | Suspicious | kw_login, kw_verify |
| `http://192.168.10.5/secure/bank/login.php` | phish | 5 | High Risk | kw_login, kw_secure, kw_bank, ipv4_host |
| `http://mybank.com@203.0.113.7/confirm` | phish | 6 | High Risk | kw_bank, kw_confirm, at_symbol, ipv4_host |
| `http://secure-update.mybank.verify.example.net/account/login` | phish | 7 | High Risk | kw_login, kw_verify, kw_account, kw_secure, kw_update, kw_bank, many_subdomains |
| `https://mybank.example-secure-login.xyz/password/reset?user=abc&token=xyz&step=2&ref=mail` | phish | 6 | High Risk | kw_login, kw_password, kw_secure, kw_bank, long_url, special_chars |
| `http://xn--mybnk-9qa.example/signin` | phish | 2 | Suspicious | kw_signin, punycode |
| `http://198.51.100.23/~user/account_update.html` | phish | 4 | High Risk | kw_account, kw_update, ipv4_host |
| `https://example.org//redirect//login.mybank.example/` | phish | 3 | Suspicious | kw_login, kw_bank, dbl_slash |
| `http://update.mybank.com.account-verify.example.ru/confirm` | phish | 6 | High Risk | kw_verify, kw_account, kw_update, kw_bank, kw_confirm, many_subdomains |
| `http://bit.ly/3xYzAbc` | phish | 0 | Low Risk | — |
| `https://mybank-support.example.top/help` | phish | 1 | Low Risk | kw_bank |

Confusion (flagged = Suspicious or High): {'tp': 10, 'fn': 2, 'fp': 1, 'tn': 9}

## Timing

analyse(): 0.323 ms per URL (13 DFAs + 3 rules)

| Input length | DFA scan (ms) | µs per char |
|---|---|---|
| 1000 | 0.389 | 0.389 |
| 2000 | 0.763 | 0.382 |
| 4000 | 1.573 | 0.393 |
| 8000 | 3.165 | 0.396 |
| 16000 | 6.088 | 0.38 |
