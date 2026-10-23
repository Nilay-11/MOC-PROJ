# Presentation script: PhishDFA

**Rule-Based Phishing URL Detector Using Finite Automata**
Models of Computation (MOC) mini project · Nilay Sengupta (25BYB0255) · Adwit Agarwal (25BYB0116)

Total time: about 5 minutes. **Nilay** speaks parts 1, 2 and 5. **Adwit** speaks parts 3 and 4. Swap if you prefer.
Keep the website open on the projector. Lines in *[brackets]* are actions, not words to say.

---

## 1. Introduction (Nilay, ~45 s)

> Good morning, sir. Our project is a **phishing URL detector built using finite automata**.
>
> Phishing is when someone sends you a fake link, for example a fake bank login page, to steal your password. These fake links often have warning signs: words like *login* or *verify*, an **@** symbol, or a raw IP address instead of a website name.
>
> Our idea is simple. A URL is just a **string of characters**. So we can use what we studied in Models of Computation, **regular expressions, NFAs and DFAs**, to look for these warning signs.

## 2. How it works (Nilay, ~1 min)

*[Scroll to "How it works".]*

> It works in four steps.
>
> **Step one:** we write each warning sign as a **regular expression**. For example, “contains the word login” is `.*login.*`.
>
> **Step two:** we convert that regular expression into an **NFA**.
>
> **Step three:** we convert the NFA into a **DFA** using the subset construction, and then **minimise** it, so we get the smallest possible DFA. For “login”, the NFA has 18 states and the minimal DFA has only 6.
>
> **Step four:** the DFA reads the URL **one character at a time**. If it finishes in an **accepting state**, the pattern was found and we add points to a risk score.
>
> We have 13 such DFAs: nine keywords (login, signin, verify, account, password, secure, update, bank, confirm), plus the @ symbol, an IP address as the host, punycode, and a double slash in the path. We also have three simple rules: a very long URL, too many subdomains, and too many special characters.
>
> Score 0 to 1 is **Low Risk**, 2 to 3 is **Suspicious**, and 4 or more is **High Risk**.

## 3. Live demo: analyzer (Adwit, ~1 min)

*[Scroll to "Try it". Click the example `mybank.com@203.0.113.7/confirm`.]*

> Let me show it working. This link looks like it goes to *mybank.com*.
>
> But look at "The URL in parts". Everything before the **@** is ignored by the browser. The real website is **203.0.113.7**, which is just an IP address. This is a common phishing trick.
>
> Here are the DFAs that reached an accepting state: **bank** (+1), **confirm** (+1), the **@ symbol** (+2) and the **IP address** (+2). The total is 6, so it is **High Risk**.

*[Click the example `www.google.com/`.]*

> For a normal link like google.com, no DFA accepts, the score is 0, and it is **Low Risk**.

## 4. Live demo: watching the DFA (Adwit, ~1 min)

*[Scroll to "Watch a DFA". Keep the pattern "login" and press **Play**.]*

> Here you can see the DFA for “login” actually running. The **blue circle** is the current state, and the tape below shows which character it is reading.
>
> Each state remembers how much of the word it has matched so far. q1 means “l” has been seen, q2 means “lo”, and so on.
>
> *[When it reads “blog”.]* Notice that in “blog” it sees “l”, “o” and “g”, but then a dash comes, so it **goes back**: it was not really “login”.
>
> *[When it reaches q5.]* Now it has read “login” and reached **q5, the gold double circle**, which is the accepting state. Once it is there it stays there, so the pattern is **found**.

*(Optional, if there is time.)* *[Scroll to "Build a DFA" and click **NFA**, then **Minimal DFA**.]*

> And here we can type any regular expression. The page builds the NFA, then the smallest DFA. This is the same conversion we studied in class.

## 5. Results and conclusion (Nilay, ~45 s)

*[Scroll to "Results".]*

> To check correctness, we tested every DFA on over **4 million strings**, and it gave the same answer as Python's built-in regex engine every time. Checking one URL takes about **0.3 milliseconds**.
>
> On 22 example URLs, it got **19 right**. The mistakes show its limits. A real Google sign-in page was flagged because it contains “signin” and “account”. A short link like bit.ly was missed, because it has no warning words.
>
> So, in conclusion: finite automata are **fast, exact and easy to explain**, which makes them good for detecting patterns in URLs. But they cannot decide on their own whether a site is really fake, so this is a helper tool, not a complete security system.
>
> Thank you, sir. We are happy to take questions.

---

## Likely questions and short answers

**Why use a DFA and not just Python regex?**
The point of the project is to show the models of computation at work. We build the DFA ourselves from the regex (regex → NFA → DFA → minimal DFA). A DFA also reads each character exactly once, so it is very fast (linear time).

**What is the difference between an NFA and a DFA?**
In a DFA there is exactly one next state for every character. In an NFA there can be several choices, or ε-moves that read no character. NFAs are easier to build from a regex; DFAs are easier to run. Every NFA can be converted into a DFA.

**What is an accepting state?**
A state that means “the pattern has been found”. If the DFA ends there, the string is accepted.

**What is a dead state?**
A state you can never leave and that is not accepting. For example, in the IP-address DFA, reading a letter sends it to the dead state, because a letter can never be part of an IP address.

**What does minimisation do?**
It merges states that behave the same way, which gives the smallest DFA for the same pattern. For “login” it went from 13 states to 6.

**Why not check everything with automata?**
Some things are not regular. For example, comparing two parts of a URL needs unlimited memory, and a DFA has only a fixed number of states. So simple counting checks are written as normal code.

**Is the score reliable?**
It is a teaching tool. The weights and the thresholds (0–1, 2–3, 4+) are rules we chose. Real systems also use blocklists and machine learning.

**Who did what?** *(Fill in honestly before the presentation.)*
