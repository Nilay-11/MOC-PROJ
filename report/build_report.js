// Builds MOC_Project_Report_Phishing_URL_Detector.docx
//   node report/build_report.js        (run from moc_phishing_detector/)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType,
  HeadingLevel, WidthType, BorderStyle, ShadingType, LevelFormat, PageBreak, Footer, Header,
  PageNumber, VerticalAlign, TabStopType,
} = require("docx");

const ROOT = path.join(__dirname, "..");
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "results.json"), "utf8"));
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "report_data.json"), "utf8"));
const FIG = (f) => path.join(__dirname, "figures", f);

const FONT = "Times New Roman";
const MONO = "Consolas";
const CONTENT_W = 9026; // A4 with 1" margins, in DXA
const ACCENT = "1F3A93";

// ---------- inline markup: **bold**, ⟪italic⟫, `code` ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|⟪[^⟫]+⟫)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: 21, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const P = (text, opts = {}) => new Paragraph({ children: runs(text), alignment: AlignmentType.JUSTIFIED, spacing: { after: 140, line: 336 }, ...opts });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore: true });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
const bullet = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 312 } });
const numbered = (text, ref = "numbers") => new Paragraph({ children: runs(text), numbering: { reference: ref, level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 312 } });
const eq = (text) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 120 }, children: [new TextRun({ text, font: "Cambria Math", size: 23 })] });
const code = (lines) => lines.map((l, i) => new Paragraph({
  spacing: { after: 0, line: 252, before: i === 0 ? 80 : 0 },
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2F4F8" },
  indent: { left: 200, right: 200 },
  children: [new TextRun({ text: l || " ", font: MONO, size: 18 })],
})).concat([new Paragraph({ spacing: { after: 120 }, children: [] })]);

let figN = 0, tabN = 0;
function figure(file, caption, maxW = 600) {
  const buf = fs.readFileSync(FIG(file));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const width = Math.min(maxW, w / 2), height = Math.round(width * h / w);
  figN++;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 60 }, keepNext: true, children: [new ImageRun({ type: "png", data: buf, transformation: { width, height }, altText: { title: caption, description: caption, name: file } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 }, children: [new TextRun({ text: `Figure ${figN}. `, bold: true, size: 21 }), ...runs(caption, { size: 21 })] }),
  ];
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "9AA3B5" };
const borders = { top: border, bottom: border, left: border, right: border };
function table(header, rows, widths, caption, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (t, isHead, w, i) => new TableCell({
    borders, width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: isHead ? { type: ShadingType.CLEAR, color: "auto", fill: "DCE3F3" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({
      alignment: (opts.center && opts.center.includes(i)) ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 0, line: 252 },
      children: runs(String(t), { size: opts.size || 20, bold: isHead || undefined, font: (opts.mono && opts.mono.includes(i) && !isHead) ? MONO : undefined }),
    })],
  });
  tabN++;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true, children: [new TextRun({ text: `Table ${tabN}. `, bold: true, size: 21 }), ...runs(caption, { size: 21 })] }),
    new Table({
      width: { size: total, type: WidthType.DXA }, columnWidths: widths, alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, true, widths[i], i)) }),
        ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, false, widths[i], i)) })),
      ],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}
const even = (n, first) => { const rest = Math.floor((CONTENT_W - (first || 0)) / (first ? n - 1 : n)); return first ? [first, ...Array(n - 1).fill(rest)] : Array(n).fill(rest); };

// ---------- data-derived tables ----------
const sz = Object.fromEntries(R.sizes.map((s) => [s.id, s]));
const eqTot = R.equivalence.reduce((a, e) => a + e.random_samples + e.exhaustive_strings, 0);
const eqAgree = R.equivalence.reduce((a, e) => a + e.random_agree + e.exhaustive_agree, 0);
const cm = R.confusion;
const kwTotal = R.sizes.filter((s) => s.id.startsWith("kw_")).reduce((a, s) => a + s.min_dfa_states, 0);
const nice = (id) => id === "union_keywords" ? "union of 9 keywords" : id.replace("kw_", "");
const T = R.timing;

// ======================================================================
//  CONTENT
// ======================================================================
const cover = [
  new Paragraph({ spacing: { before: 600, after: 120 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MODEL OF COMPUTATION", bold: true, size: 30, color: ACCENT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [new TextRun({ text: "Project Report", size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: "Rule-Based Phishing URL Detector", bold: true, size: 48 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [new TextRun({ text: "Using Finite Automata", bold: true, size: 48 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Regular expressions  →  NFA  →  DFA  →  minimal DFA", italics: true, size: 24, color: "444444" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160, before: 500 }, children: [new TextRun({ text: "Submitted by", size: 24 })] }),
  new Table({
    width: { size: 6000, type: WidthType.DXA }, columnWidths: [3600, 2400], alignment: AlignmentType.CENTER,
    rows: [["Team Member", "Register Number"], ["Nilay Sengupta", "25BYB0255"], ["Adwit Agarwal", "25BYB0116"]].map((r, i) => new TableRow({
      children: r.map((t, j) => new TableCell({
        borders, width: { size: j ? 2400 : 3600, type: WidthType.DXA },
        shading: i === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "DCE3F3" } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, bold: i === 0, size: 24 })] })],
      })),
    })),
  }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 80 }, children: [new TextRun({ text: "Subject: Theory of Computation / Model of Computation (MOC)", size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Project Type: Mini Project", size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Faculty: ______________________________", size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "October 2026", size: 24 })] }),
];

const abstractText =
  "Phishing attacks lure users to fraudulent websites through deceptive URLs, and many of these URLs share recognisable textual patterns. " +
  "This project investigates how such patterns can be detected with the models of computation studied in Theory of Computation. " +
  "The objective is an explainable, rule-based phishing URL detector in which every suspicious pattern is a regular language recognised by a finite automaton. " +
  "A URL is modelled as a string over a 60-symbol alphabet Σ. Thirteen patterns, nine suspicious keywords, the “@” symbol, an IPv4 address used as the hostname, punycode hosts and “//” redirections, are written as regular expressions. " +
  "Each expression is converted into an NFA with ε-moves, turned into a DFA by the subset construction, and reduced to a minimal DFA by partition refinement. " +
  "The minimal DFAs read the URL, or its host or path component, one symbol at a time. Their accept or reject verdicts are combined with three structural rules into a weighted risk score, classified as Low Risk, Suspicious or High Risk. " +
  "The engine was implemented in Python with a Flask API and an interactive web interface. " +
  `Every minimal DFA agreed with Python's regular-expression engine on all ${(eqTot / 1e6).toFixed(2)} million test strings, scanned input in linear time (about ${T.dfa_scan[T.dfa_scan.length - 1].us_per_char} µs per character), and minimisation roughly halved each keyword automaton. ` +
  `On a 22-URL illustrative set, the detector classified ${cm.tp + cm.tn} URLs as labelled. ` +
  "The project shows that regular languages and finite automata give a fast, verifiable and transparent basis for pattern-based URL screening, and makes their limits visible.";

const abstract = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Abstract")], pageBreakBefore: true }),
  P(abstractText),
  new Paragraph({ spacing: { before: 200, after: 140 }, alignment: AlignmentType.JUSTIFIED, children: [
    new TextRun({ text: "Keywords: ", bold: true }),
    new TextRun("Model of Computation, Finite Automata (DFA, NFA), Regular Expressions, Phishing URL Detection, Cybersecurity, Subset Construction, DFA Minimisation, Rule-Based Risk Scoring."),
  ] }),
];

const contents = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Contents")], pageBreakBefore: true }),
  ...[
    ["Abstract and Keywords", 0],
    ["1. Introduction", 0], ["1.1 Background", 1], ["1.2 Problem Statement", 1], ["1.3 Objectives", 1], ["1.4 Scope of the Project", 1],
    ["2. Theoretical Background", 0], ["2.1 Fundamentals of the Selected Model", 1], ["2.2 Formal Definition and Mathematical Representation", 1], ["2.3 Relevant Theorems and Properties", 1], ["2.4 Relevance to the Selected Application", 1],
    ["3. Proposed Model and Methodology", 0], ["3.1 Problem Formulation", 1], ["3.2 System Architecture and Workflow", 1], ["3.3 Design of the Computational Model", 1],
    ["4. Implementation and Results", 0], ["4.1 Tools and Technologies Used", 1], ["4.2 Experimental Results", 1],
    ["5. Applications, Discussion and Limitations", 0], ["5.1 Practical Applications", 1], ["5.2 Limitations and Challenges", 1], ["5.3 Discussion", 1],
    ["6. Conclusion and Future Scope", 0], ["6.1 Conclusion", 1], ["6.2 Future Enhancements", 1],
    ["References", 0], ["Appendix A: Project Files and How to Run", 0],
  ].map(([t, l]) => new Paragraph({ indent: { left: l * 500 }, spacing: { after: 70 }, children: [new TextRun({ text: t, bold: l === 0, size: 24 })] })),
];

// ---------------- 1. Introduction ----------------
const intro = [
  H1("1. Introduction"),
  H2("1.1 Background"),
  P("Phishing is a social-engineering attack in which an attacker imitates a trusted service, such as a bank, an e-mail provider or a university portal, to trick a user into revealing credentials or installing malware. The link the victim is asked to open is the attacker's main delivery mechanism, so the URL itself often carries the first warning signs: words such as ⟪login⟫, ⟪verify⟫ or ⟪account⟫ placed in unusual positions, an “@” that hides the real host, a raw IP address instead of a domain name, unusually many subdomain levels, or encoded internationalised hostnames."),
  P("Production systems detect phishing with blocklists, reputation services and machine-learning classifiers. Those methods are effective but often opaque. They need large labelled datasets, and their decisions are hard to explain. A Theory of Computation course offers another view of the same problem: a URL is a finite string over a finite alphabet, and a “suspicious pattern” is a set of strings, that is, a formal language. When that language is regular, a finite automaton can recognise it exactly, in a single left-to-right pass, with constant memory."),
  P("This project builds a phishing URL detector on that idea. It does not claim that finite automata solve phishing detection. Instead it shows, with working code and measured results, how regular patterns that occur in URLs can be specified formally, compiled into automata by the standard constructions, verified, and combined into a transparent risk assessment."),
  H2("1.2 Problem Statement"),
  P("Design and implement a rule-based system that accepts a URL as a string, analyses it for predefined suspicious patterns using finite automata, performs additional structural checks, and produces an interpretable risk classification. Every pattern must be expressed as a regular expression and recognised by a deterministic finite automaton that is derived from the expression by the formal constructions of automata theory (regular expression → NFA → DFA → minimal DFA), rather than coded by hand."),
  H2("1.3 Objectives"),
  bullet("Model URLs as strings over a defined alphabet Σ of URL characters."),
  bullet("Express suspicious URL patterns as regular expressions, and hence as regular languages."),
  bullet("Convert each regular expression into an NFA with ε-moves, convert the NFA into an equivalent DFA by the subset construction, and minimise the DFA."),
  bullet("Implement a DFA engine with explicit states, transition function, start state and accepting states that processes a URL one character at a time."),
  bullet("Verify that every compiled automaton accepts exactly the language of its regular expression."),
  bullet("Combine the automata verdicts with structural URL rules into an interpretable risk score and a final class."),
  bullet("Present the system through a web interface that also visualises the automata and their step-by-step computation."),
  H2("1.4 Scope of the Project"),
  P("The project covers lexical analysis of the URL string only. It parses the URL into components, recognises 13 patterns with minimal DFAs, applies three structural rules, and assigns one of three risk classes. It does not fetch the web page, query DNS or WHOIS, use blocklists, or apply machine learning. Patterns are kept simple and readable for teaching purposes, and the weights and thresholds are project-defined. The risk score is therefore an educational heuristic, not a security verdict. The evaluation uses a small illustrative URL set written by the team, so it demonstrates behaviour rather than estimating real-world accuracy."),
];

// ---------------- 2. Theory ----------------
const theory = [
  H1("2. Theoretical Background"),
  H2("2.1 Fundamentals of the Selected Model"),
  P("The selected models of computation are **regular expressions**, **nondeterministic finite automata (NFA)** and **deterministic finite automata (DFA)**, the three equivalent descriptions of the class of regular languages."),
  P("**Alphabet, strings and languages.** An alphabet Σ is a finite, non-empty set of symbols. A string over Σ is a finite sequence of symbols; ε denotes the empty string and Σ* the set of all strings. A language is any subset L ⊆ Σ*. In this project Σ contains the 59 characters permitted in a URL by RFC 3986 after lower-casing (a–z, 0–9 and - . _ ~ : / ? # [ ] @ ! $ & ' ( ) * + , ; = %) together with one extra symbol ⊥ that stands for any other character, giving |Σ| = 60."),
  P("**Regular expressions** describe languages using three operations: union (r₁ | r₂), concatenation (r₁r₂) and Kleene star (r*). The detector also uses the standard shorthands r+ = rr*, r? = r | ε, character classes such as [0-9], and “.” for any symbol of Σ."),
  P("**Finite automata** are abstract machines with a finite set of states and no other memory. A DFA has exactly one next state for each state and input symbol. An NFA may have zero, one or several next states, and may also change state on ε without reading input. NFAs are convenient to construct from regular expressions, while DFAs are convenient to execute."),
  H2("2.2 Formal Definition and Mathematical Representation"),
  P("A **deterministic finite automaton** is a 5-tuple"),
  eq("M = (Q, Σ, δ, q₀, F)"),
  P("where Q is a finite set of states, Σ is the input alphabet, δ : Q × Σ → Q is the transition function, q₀ ∈ Q is the start state and F ⊆ Q is the set of accepting states. The extended transition function δ̂ : Q × Σ* → Q applies δ along a string:"),
  eq("δ̂(q, ε) = q,      δ̂(q, wa) = δ(δ̂(q, w), a)"),
  P("and the language accepted by M is"),
  eq("L(M) = { w ∈ Σ* | δ̂(q₀, w) ∈ F }."),
  P("A **nondeterministic finite automaton with ε-moves** is a 5-tuple N = (Q, Σ, δ, q₀, F) in which the transition function returns a set of states, δ : Q × (Σ ∪ {ε}) → 𝒫(Q). The ε-closure of a set S, written E(S), is the set of states reachable from S by ε-moves alone. N accepts w if at least one sequence of choices ends in a state of F."),
  P("**Example: the keyword “login”.** The language of URLs that contain the keyword is"),
  eq("L_login = Σ* · login · Σ*,      written as the regular expression  .*login.*"),
  P("Its minimal DFA (derived in Section 3.3) has Q = {q₀, …, q₅}, start state q₀ and F = {q₅}. State qᵢ means that the longest suffix of the input read so far which is also a prefix of “login” has length i. For example, q₂ means that the input so far ends with “lo”. Once q₅ is reached, the keyword has occurred and q₅ loops on every symbol of Σ, so the URL is accepted whatever follows."),
  P("**Symbol classes.** To keep transition tables small, each pattern partitions Σ into the coarsest set of classes whose members the expression cannot tell apart. For .*login.* the classes are {g}, {i}, {l}, {n}, {o} and “other” (the remaining 55 symbols), so δ needs 6 columns rather than 60. This is the character-class technique used by lexer generators; it changes the table size, not the language recognised."),
  H2("2.3 Relevant Theorems and Properties"),
  P("**Theorem 1 (Kleene).** A language is denoted by a regular expression if and only if it is accepted by some finite automaton. The constructive direction, regular expression → NFA, builds an NFA with ε-moves from two-state fragments: one fragment per symbol, joined by ε-moves for concatenation, union and star. The resulting NFA has at most 2|r| states, one start state and one accepting state."),
  P("**Theorem 2 (Rabin–Scott subset construction).** For every NFA N there is a DFA D with L(D) = L(N). The states of D are sets of states of N:"),
  eq("q_D0 = E({q₀}),      δ_D(S, a) = E( ⋃_{q ∈ S} δ_N(q, a) ),      F_D = { S | S ∩ F_N ≠ ∅ }"),
  P("In the worst case D has 2^|Q_N| states. Only subsets reachable from q_D0 are generated in practice, and the empty set becomes the dead (trap) state."),
  P("**Theorem 3 (Myhill–Nerode).** For a language L, define x ≡_L y if, for every z ∈ Σ*, xz ∈ L ⇔ yz ∈ L. L is regular if and only if ≡_L has finitely many equivalence classes, and the minimal DFA for L has exactly one state per class. It is unique up to renaming of states. Moore's partition-refinement algorithm computes it: start from the partition {F, Q∖F} and repeatedly split any block whose states move to different blocks on some symbol, until no block splits."),
  P("**Theorem 4 (closure properties).** Regular languages are closed under union, intersection, complement, concatenation and Kleene star. Hence “contains login ⟪or⟫ verify” is regular, and the nine keyword DFAs can be merged into one automaton (Section 4.2 measures this)."),
  P("**Property 5 (linear-time recognition).** A DFA reads each input symbol once and does one table lookup per symbol, so deciding w ∈ L(M) takes O(|w|) time and O(1) extra memory, independent of how complicated the pattern was."),
  P("**Theorem 6 (pumping lemma).** If L is regular there is a constant p such that every w ∈ L with |w| ≥ p can be written w = xyz with |xy| ≤ p, |y| ≥ 1 and xyⁱz ∈ L for all i ≥ 0. It proves that some languages, such as {aⁿbⁿ | n ≥ 0} or balanced brackets, are not regular. This marks the boundary of what the automata part of the detector can do, which is why counting rules are implemented outside the automata (Section 3.2)."),
  H2("2.4 Relevance to the Selected Application"),
  P("The suspicious URL patterns targeted by the detector are naturally regular. “Contains a keyword” is Σ*wΣ*, “contains @” is Σ*@Σ*, and “is a dotted-quad of digit strings” is [0-9]+(\\.[0-9]+)³. Kleene's theorem guarantees that each pattern has a DFA. The subset construction and minimisation produce that DFA mechanically and optimally, and Property 5 makes the scan fast. Each verdict can also be explained by a concrete computation: the sequence of states visited and the accepting state reached. The pumping lemma explains what must stay outside the automata, such as unbounded counting or comparing two parts of the URL. Table 1 maps each MOC concept to its role in the project."),
  ...table(["MOC concept", "Symbol", "Application in the project"], [
    ["Alphabet", "Σ", "59 URL characters plus ⊥, compressed into symbol classes per pattern"],
    ["String", "w ∈ Σ*", "The normalised URL, or its host or path component"],
    ["Language", "L ⊆ Σ*", "The set of URLs that contain a given suspicious pattern"],
    ["Regular expression", "r", "`.*login.*`, `.*@.*`, `[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+`, …"],
    ["Regular language", "L(r)", "The language recognised by each of the 13 automata"],
    ["NFA with ε-moves", "N", "First automaton built from each regular expression"],
    ["Subset construction", "𝒫(Q_N)", "Converts every NFA into an equivalent complete DFA"],
    ["DFA", "(Q, Σ, δ, q₀, F)", "The deterministic recogniser that scans the URL"],
    ["States", "Q", "How much of the pattern has been matched so far"],
    ["Transitions", "δ", "Table lookup δ[q][class(c)], including fall-back moves after a partial match"],
    ["Start state", "q₀", "Nothing of the pattern matched yet"],
    ["Accepting state", "F", "Pattern recognised; for Σ*wΣ* it loops on all of Σ"],
    ["Dead / reject state", "q_d", "Pattern can no longer be completed (IPv4 DFA after a letter)"],
    ["Minimisation", "≡_L", "Moore's refinement yields the smallest DFA for each pattern"],
  ], [2300, 1700, 5026], "Mapping of MOC concepts to the project", { size: 19 }),
];

// ---------------- 3. Proposed model ----------------
const L = D.login, IP = D.ipv4;
const subsetRows = L.subset.map((r) => [(r.d === "D0" ? "→" : "") + (r.acc ? "*" : "") + r.d, "{" + r.set.join(", ") + "}", ...r.t]);
const model = [
  H1("3. Proposed Model and Methodology"),
  H2("3.1 Problem Formulation"),
  P("Let u be the URL entered by the user. Normalisation lower-cases u and maps every character outside the URL alphabet to ⊥, giving a string w ∈ Σ*. A parser splits w into components: scheme, userinfo, host, port, path, query and fragment. The host is further split into subdomain and registered domain."),
  P("The detector holds a catalogue of patterns P₁, …, P₁₃. Each pattern Pᵢ = (rᵢ, cᵢ, wᵢ) consists of a regular expression rᵢ, the URL component cᵢ ∈ {url, host, path} that it reads, and a weight wᵢ. For each pattern the system computes the minimal DFA Mᵢ with L(Mᵢ) = L(rᵢ) and the Boolean verdict"),
  eq("dᵢ = [ δ̂ᵢ(q₀, component_cᵢ(w)) ∈ Fᵢ ]"),
  P("Three structural predicates s₁, s₂, s₃ (URL length, number of host labels, number of special characters) are evaluated directly. The risk score and class are"),
  eq("score(u) = Σᵢ wᵢ·dᵢ + Σⱼ sⱼ,      class = Low Risk if score ≤ 1;  Suspicious if 2 ≤ score ≤ 3;  High Risk if score ≥ 4"),
  P("The weights and thresholds are design choices of the project, not mathematical properties of finite automata. The detector is deliberately a ⟪combination⟫ of several regular languages and ordinary rules. It is not claimed that “phishing URL” is itself a regular language."),
  ...table(["Pattern", "Regular expression", "Reads", "Weight"], [
    ["Keywords (9): login, signin, verify, account, password, secure, update, bank, confirm", "`.*k.*` for each keyword k", "url", "+1 each"],
    ["“@” symbol in URL", "`.*@.*`", "url", "+2"],
    ["IPv4 address as hostname", "`[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+`", "host", "+2"],
    ["Punycode host", "`.*xn--.*`", "host", "+1"],
    ["“//” redirect inside path", "`.*//.*`", "path", "+1"],
    ["URL longer than 75 characters", "structural rule", "url", "+1"],
    ["More than 3 hostname labels (not counted for IP hosts)", "structural rule", "host", "+1"],
    ["More than 6 special characters (- _ = & % ~)", "structural rule", "url", "+1"],
  ], [3900, 2900, 1000, 1226], "Pattern catalogue and risk-scoring weights", { size: 19, center: [2, 3] }),
  H2("3.2 System Architecture and Workflow"),
  P("The system is divided into four modules (Figure 1). The automata are responsible only for pattern recognition. Parsing, the counting rules and scoring live in separate modules, which keeps each part simple and keeps the formal claims precise."),
  ...figure("fig_architecture.png", "The four modules of the detector"),
  numbered("**URL parser** (`parse_url`) normalises case and extracts the components. The real host is taken after the ⟪last⟫ “@” in the authority part, which exposes the classic trick `http://mybank.com@203.0.113.7/`, where the browser actually connects to 203.0.113.7.", "arch"),
  numbered("**MOC automata engine** (`compile_regex`, `DFA.run`) parses each regular expression, builds the NFA, applies the subset construction and minimisation, and runs the minimal DFA on the chosen component.", "arch"),
  numbered("**Suspicious-feature detector** (`analyse`, `classify`) collects the 13 DFA verdicts, evaluates the 3 structural rules and computes the score and class.", "arch"),
  numbered("**Web interface** (`app.py`, `website/index.html`) shows the analysis, the extracted components and each DFA's verdict. It lets the user step through any DFA's computation and build automata from any regular expression.", "arch"),
  P("The workflow is: User URL → preprocessing → component extraction → 13 DFAs and 3 rules → pattern results → risk score → Low / Suspicious / High."),
  P("Counting conditions such as “more than 3 labels” could in principle be written as regular languages, because the bounds are fixed. They are implemented as plain rules because that is simpler and clearer. Conditions with no fixed bound, such as comparing the displayed link text with the real host, are not regular at all (Theorem 6)."),
  H2("3.3 Design of the Computational Model"),
  P("Every pattern passes through the same four-stage compilation pipeline. The stages are illustrated here for the keyword pattern `.*login.*`."),
  H3("Stage 1: Alphabet compression"),
  P("The parser collects the character sets used by the expression ({l}, {o}, {g}, {i}, {n} and Σ for each “.”). The coarsest partition of Σ that respects all of them gives the symbol classes g, i, l, n, o and other. All later stages work over these 6 classes."),
  H3("Stage 2: Regular expression → NFA"),
  P(`Each symbol becomes a two-state fragment s —a→ f. Concatenation links fragments with ε-moves, and a star adds ε-moves that allow skipping or repeating its fragment. For .*login.* this gives an NFA with ${L.nfa} states and ${L.eps} ε-moves, with start state 0 and accepting state 15 (Figure 2). States 0–4 implement the leading Σ*, states 5–13 spell l-o-g-i-n, and states 14–17 implement the trailing Σ*.`),
  ...figure("fig_nfa_login.png", "NFA with ε-moves for .*login.* (start state 0, accepting state 15)"),
  H3("Stage 3: Subset construction (NFA → DFA)"),
  P(`Starting from E({0}) = {0, 1, 2, 4}, the algorithm computes E(move(S, a)) for every reachable set S and every symbol class a. Table 3 lists all ${L.subset.length} reachable subsets. A subset is accepting when it contains NFA state 15. Although 2¹⁸ = 262,144 subsets are possible, only ${L.subset.length} are reachable.`),
  ...table(["D-state", "ε-closure (NFA states)", ...L.labels], subsetRows, [950, 3100, ...Array(6).fill(829)], "Subset construction for .*login.* (→ start, * accepting)", { size: 17, mono: [0, 1, 2, 3, 4, 5, 6, 7], center: [2, 3, 4, 5, 6, 7] }),
  H3("Stage 4: Minimisation (Moore's partition refinement)"),
  P(`The initial partition separates accepting from non-accepting D-states. Every round splits off one more non-accepting state, according to how far it is from completing the keyword. After ${L.rounds.length - 1} refining rounds the partition is stable. All seven accepting D-states (D6–D12) are equivalent, because once “login” has been seen every continuation is accepted. The result has 6 states (Figure 3).`),
  ...figure("fig_minimisation.png", "Partition-refinement rounds for the .*login.* DFA (accepting blocks outlined)", 560),
  P("States are renamed q₀, q₁, … in breadth-first order from the start state. The resulting minimal DFA (Figure 4, Table 4) is the q₀ → q₁ → … → q₅ chain from the project proposal, completed with the fall-back transitions needed for substring search. For example, δ(q₂, l) = q₁: after reading “lol”, the last “l” may begin a new occurrence of “login”, so the machine falls back to q₁ rather than to q₀. These are exactly the failure transitions of the Knuth–Morris–Pratt algorithm, obtained here automatically by the subset construction."),
  ...figure("fig_dfa_login.png", "Minimal DFA for .*login.*; F = {q5}. Edges back to q0 or q1 are the fall-back transitions", 520),
  ...table(["δ", ...L.labels], L.table.slice(1), [1300, ...Array(6).fill(1287)], "Transition table of the minimal .*login.* DFA (→ start, * accepting)", { size: 19, mono: [0, 1, 2, 3, 4, 5, 6], center: [1, 2, 3, 4, 5, 6] }),
  H3("A pattern with a dead state: IPv4 hostname"),
  P(`The IPv4 pattern must match the ⟪whole⟫ host, so it is not wrapped in Σ*…Σ*. Its NFA has ${IP.nfa} states. The subset construction gives 9 DFA states, one of which is the empty set ∅. Minimisation leaves all 9 distinct, including the dead state q_d (Figure 5, Table 5). Any letter, or a misplaced dot, sends the machine to q_d, where it stays.`),
  ...figure("fig_dfa_ipv4.png", "Minimal DFA for [0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+ (dashed: dead state q_d)", 560),
  ...table(["δ", ...IP.labels], IP.table.slice(1), [2000, 2342, 2342, 2342], "Transition table of the IPv4-host DFA", { size: 19, mono: [0, 1, 2, 3], center: [1, 2, 3] }),
  H3("DFA engine"),
  P("The engine stores the 5-tuple directly. A run is the extended transition function δ̂, and it returns the whole state trace so that the interface can animate it:"),
  ...code([
    "@dataclass",
    "class DFA:",
    "    states: list[str]            # Q",
    "    classes: list[frozenset]     # Σ, compressed into symbol classes",
    "    delta: list[list[int]]       # δ[q][class] -> q'",
    "    start: int                   # q0",
    "    accepting: set[int]          # F",
    "",
    "    def run(self, text):         # extended transition function δ̂",
    "        q, trace = self.start, [self.start]",
    "        for ch in text:",
    "            q = self.delta[q][self.symbol_of(ch)]",
    "            trace.append(q)",
    "        return trace",
    "",
    "    def accepts(self, text):",
    "        return self.run(text)[-1] in self.accepting",
  ]),
  P("**Worked example.** For `http://login.example.com/verify-account`, the login DFA moves q₀ → q₁ → q₂ → q₃ → q₄ → q₅ while reading “login” and then stays in q₅, so it accepts. The verify and account DFAs also accept. No other DFA or rule fires, so the score is 1 + 1 + 1 = 3 and the URL is classed **Suspicious**, the same result predicted in the project proposal."),
];

// ---------------- 4. Implementation and results ----------------
const exRows = R.examples.map((r) => [r.url, r.label, String(r.score), r.classification, r.indicators.map((i) => i.replace("kw_", "")).join(", ") || "—"]);
const results = [
  H1("4. Implementation and Results"),
  H2("4.1 Tools and Technologies Used"),
  ...table(["Component", "Technology", "Purpose"], [
    ["Automata engine", "Python 3 (standard library only)", "Regex parser, NFA construction, subset construction, minimisation, DFA execution"],
    ["Detector", "Python 3", "URL parsing, pattern catalogue, structural rules, scoring"],
    ["Back end", "Flask", "`/api/analyze`, `/api/automaton/<id>` and `/api/compile` JSON endpoints"],
    ["Front end", "HTML, CSS, JavaScript (no frameworks)", "Analyzer, step-by-step DFA simulator, construction lab, results"],
    ["Visualisation", "Inline SVG generated in JavaScript", "State diagrams, tape animation, gauges and charts"],
    ["Testing", "pytest, Python `re` as reference oracle", "Unit tests and DFA-versus-regex equivalence checks"],
    ["Evaluation", "`evaluate.py`", "Reproduces every number reported in this chapter"],
  ], [1900, 2900, 4226], "Tools and technologies", { size: 19 }),
  P("The browser version of the engine is a line-for-line JavaScript port of the Python engine, so the website works without a server. A parity check confirmed that both produce identical automata (all state counts) and identical scores and indicators for every URL in the evaluation set."),
  H2("4.2 Experimental Results"),
  H3("Experiment 1: Automaton sizes through the pipeline"),
  P("Table 7 reports the size of every automaton at each stage, and Figure 6 plots it."),
  ...table(["Pattern", "Σ classes", "NFA states", "ε-moves", "Subset DFA", "Minimal DFA"],
    R.sizes.map((s) => [nice(s.id), s.symbol_classes, s.nfa_states, s.nfa_eps, s.subset_dfa_states, s.min_dfa_states]),
    [2526, 1300, 1300, 1300, 1300, 1300], "Number of states at each stage of the compilation pipeline", { size: 19, center: [1, 2, 3, 4, 5] }),
  ...figure("fig_sizes.png", "States per pattern: NFA, subset-construction DFA and minimal DFA", 600),
  P(`**Observations.** (i) The subset construction stayed far below its 2ⁿ worst case. Every DFA had fewer states than the NFA it came from (for example 18 → 13 for login and 120 → 111 for the union). (ii) Minimisation roughly halved every keyword DFA. A keyword of length k always ends with exactly k + 1 states, which matches the Myhill–Nerode count: one class for each matched prefix length. (iii) The IPv4 DFA was already minimal after the subset construction (9 → 9). (iv) Merging the nine keywords into one regular expression gives a single ${sz.union_keywords.min_dfa_states}-state DFA, compared with ${kwTotal} states for the nine separate DFAs. The single DFA is smaller, but it only reports that ⟪some⟫ keyword occurred. The project keeps separate DFAs so that each keyword is reported and weighted individually.`),
  H3("Experiment 2: Correctness of the compiled automata"),
  P(`Each minimal DFA was compared with Python's \`re.fullmatch\` on the same inputs, using two tests: 20,000 random strings per pattern, biased towards the pattern's own characters so that matches are common, and an exhaustive test of every string up to length L built from one representative character per symbol class. In total ${eqTot.toLocaleString("en-US")} strings were checked, and the DFA and \`re\` agreed on ${eqAgree.toLocaleString("en-US")} of them (100%).`),
  ...table(["Pattern", "Random agreement", "Exhaustive agreement", "L"],
    R.equivalence.map((e) => [nice(e.id), `${e.random_agree.toLocaleString("en-US")} / ${e.random_samples.toLocaleString("en-US")}`, `${e.exhaustive_agree.toLocaleString("en-US")} / ${e.exhaustive_strings.toLocaleString("en-US")}`, e.exhaustive_max_len]),
    [2526, 2500, 3000, 1000], "DFA versus Python re: agreement on identical inputs", { size: 19, center: [1, 2, 3] }),
  P("In addition, 17 unit tests pass. They include the textbook expression (a|b)*abb, whose minimal DFA has 4 live states as expected, and checks for ε in alternation, negated classes, and the fall-back transition needed to accept “lologin”."),
  H3("Experiment 3: Detection on an illustrative URL set"),
  P("The team wrote 22 URLs: 10 benign URLs of well-known sites and 12 phishing-style URLs that use invented or reserved domains (such as example.com and the 203.0.113.0/24 documentation range) to imitate common phishing structures. A URL counts as ⟪flagged⟫ when it is classed Suspicious or High Risk. Table 9 lists the results, and Figure 7 shows the analyzer for one of them."),
  ...table(["URL", "Label", "Score", "Class", "Indicators detected"], exRows, [3700, 800, 700, 1250, 2576], "Detector output on the illustrative URL set", { size: 16, mono: [0], center: [1, 2] }),
  ...table(["", "Flagged", "Not flagged"], [["Phishing-style (12)", `${cm.tp} (true positive)`, `${cm.fn} (false negative)`], ["Benign (10)", `${cm.fp} (false positive)`, `${cm.tn} (true negative)`]], [3026, 3000, 3000], "Confusion matrix on the illustrative set", { size: 20, center: [1, 2] }),
  P(`The detector classified ${cm.tp + cm.tn} of the 22 URLs as labelled. The three errors show its limits clearly. \`accounts.google.com/signin\` is legitimate but contains two keywords (score 2). \`bit.ly/3xYzAbc\` hides its destination behind a shortener and contains no pattern (score 0). \`mybank-support.example.top/help\` imitates a brand without any listed keyword (score 1). Because this set is small and was written by the team, these figures illustrate behaviour and are not an accuracy estimate.`),
  ...figure("fig_analyzer.png", "Web interface: risk gauge, component extraction and the 13 DFA verdicts for a phishing-style URL", 560),
  H3("Experiment 4: Running time"),
  P(`Because a DFA does one lookup per character, scan time should grow linearly with input length. Table 11 and Figure 8 confirm this. The time per character stays constant at about ${T.dfa_scan[0].us_per_char} µs from 1,000 to 16,000 characters. A complete analysis (parsing, 13 DFAs and 3 rules) took ${T.analyse_ms_per_url} ms per URL on average in pure Python. The JavaScript engine in the browser is considerably faster still.`),
  ...table(["Input length (characters)", "DFA scan time (ms)", "Time per character (µs)"], T.dfa_scan.map((d) => [d.length.toLocaleString("en-US"), d.ms, d.us_per_char]), [3026, 3000, 3000], "Scan time of the login DFA versus input length", { size: 20, center: [0, 1, 2] }),
  ...figure("fig_timing.png", "DFA scan time grows linearly with input length (O(n))", 440),
  H3("Interactive demonstration"),
  P("The website includes a step-by-step simulator (Figure 9). The user picks a pattern and an input, then steps forward and backward through the computation. The current state is highlighted in the diagram, the tape shows the state after each symbol, and the transition table highlights the entry δ(q, a) being applied. At the end the simulator reports whether the final state is in F. A construction lab accepts any regular expression and shows all four stages: symbol classes, NFA diagram, subset-construction table, refinement rounds and the minimal DFA."),
  ...figure("fig_simulator.png", "Step-by-step DFA simulator after 12 steps on http://login.example.com/verify-account", 600),
];

// ---------------- 5. Applications ----------------
const discussion = [
  H1("5. Applications, Discussion and Limitations"),
  H2("5.1 Practical Applications"),
  bullet("**First-line URL screening** in e-mail gateways, chat applications or browser extensions, where a fast, explainable pre-filter decides which links need deeper inspection."),
  bullet("**User awareness tools** that explain ⟪why⟫ a link looks risky (“the real host is after the @”, “IP address used as hostname”) instead of giving an opaque verdict."),
  bullet("**Feature extraction for machine learning.** The DFA verdicts are cheap, well-defined Boolean features for a downstream classifier."),
  bullet("**Log and traffic analysis.** Linear-time DFAs can scan very large proxy or DNS logs in one pass with constant memory, which is the same principle behind signature engines in intrusion-detection systems."),
  bullet("**Teaching.** The interface makes the regex → NFA → DFA → minimal DFA pipeline and the computation of a DFA visible on real-world input."),
  H2("5.2 Limitations and Challenges"),
  bullet("**Keywords are evidence, not proof.** Legitimate sites use words such as ⟪account⟫ and ⟪signin⟫ (a false positive in Experiment 3)."),
  bullet("**Clean-looking malicious URLs pass.** URL shorteners, newly registered domains and brand imitation without keywords produce no pattern match (false negatives)."),
  bullet("**Evasion.** Attackers can use homoglyphs (paypa1), percent-encoding or other obfuscation that the current patterns do not cover. Lower-casing is the only normalisation performed."),
  bullet("**Expressive limits of regular languages.** By the pumping lemma, DFAs cannot compare two unbounded parts of a string (for example link text against real host) or count without a bound. Such checks need more powerful models or ordinary code."),
  bullet("**Project-defined scoring.** The weights and thresholds were chosen by hand and are not calibrated on data."),
  bullet("**Evaluation size.** The 22-URL set is illustrative. A meaningful accuracy estimate needs a large public dataset."),
  H2("5.3 Discussion"),
  P("The results support the central claim of the project. Every pattern compiled from a regular expression produced a DFA that is provably equivalent to the expression, confirmed experimentally on over four million strings. Each DFA is minimal by construction and runs in time linear in the URL length. The theory explains the behaviour observed in practice. The Myhill–Nerode theorem predicts that a keyword of length k needs exactly k + 1 states, and every keyword DFA had exactly that many. The subset construction's exponential bound never materialised, because the NFAs built from these expressions have little real nondeterminism."),
  P("The project also makes the limits of the model visible. The automata answer “does this regular pattern occur?” exactly, but whether a URL is phishing is a semantic question that depends on intent, context and reputation, and it is not a regular property. Separating the precise part (regular pattern recognition) from the heuristic part (weights and thresholds) keeps the system honest: every verdict can be traced to concrete automaton runs, and every judgement call is visible in a small table of weights."),
  P("Finally, the comparison between nine separate keyword DFAs and their 44-state union shows a design trade-off allowed by the closure properties. A single product automaton is smaller and needs only one pass, while separate automata keep the individual verdicts that make the score explainable. Accepting states labelled with the keywords they recognise, as in the Aho–Corasick construction, would combine both advantages."),
];

// ---------------- 6. Conclusion ----------------
const conclusion = [
  H1("6. Conclusion and Future Scope"),
  H2("6.1 Conclusion"),
  P("This project applied the models of computation from Theory of Computation to a real cybersecurity problem. URLs were modelled as strings over a 60-symbol alphabet, and thirteen suspicious patterns were specified as regular expressions. Each expression was compiled by the standard constructions, converted into an NFA, determinised by the subset construction and minimised by partition refinement, into a minimal DFA that scans the relevant part of the URL in linear time. The DFA verdicts and three structural rules produce a transparent risk score and class."),
  P(`The implementation includes a Python engine, a Flask API and an interactive website with a live analyzer, a step-by-step DFA simulator and a construction lab. It was verified against Python's regular-expression engine on ${(eqTot / 1e6).toFixed(2)} million strings with no disagreements, and it scans URLs at about ${T.dfa_scan[0].us_per_char} µs per character. On an illustrative set it flagged ${cm.tp} of 12 phishing-style URLs with one false positive among 10 benign URLs. The errors it made follow directly from the limits of keyword-based, regular-language recognition. The project therefore shows both the practical value of alphabets, regular expressions, NFAs, DFAs, the subset construction and minimisation, and the boundary of what these models can decide on their own.`),
  H2("6.2 Future Enhancements"),
  bullet("Add a trusted-domain allowlist and percent-decoding before the automata run, to reduce false positives and resist encoding tricks."),
  bullet("Build one product DFA whose accepting states record which keywords were found (Aho–Corasick style), keeping per-keyword verdicts with a single pass."),
  bullet("Add regular patterns for homoglyphs and typosquatting (for example 0 for o, rn for m, 1 for l)."),
  bullet("Use pushdown automata or context-free grammars for nested structures, such as URLs embedded inside query parameters."),
  bullet("Integrate threat-intelligence feeds, and calibrate the weights on a large public phishing dataset."),
  bullet("Compare the rule-based detector with machine-learning detectors, and use the DFA verdicts as interpretable features."),
];

const refs = [
  "J. E. Hopcroft, R. Motwani and J. D. Ullman, ⟪Introduction to Automata Theory, Languages, and Computation⟫, 3rd ed. Pearson, 2006.",
  "M. Sipser, ⟪Introduction to the Theory of Computation⟫, 3rd ed. Cengage Learning, 2012.",
  "A. V. Aho, M. S. Lam, R. Sethi and J. D. Ullman, ⟪Compilers: Principles, Techniques, and Tools⟫, 2nd ed. Addison-Wesley, 2006, ch. 3 (lexical analysis, regular expressions to automata).",
  "S. C. Kleene, “Representation of events in nerve nets and finite automata,” in ⟪Automata Studies⟫, Princeton University Press, 1956, pp. 3–41.",
  "M. O. Rabin and D. Scott, “Finite automata and their decision problems,” ⟪IBM Journal of Research and Development⟫, vol. 3, no. 2, pp. 114–125, 1959.",
  "E. F. Moore, “Gedanken-experiments on sequential machines,” in ⟪Automata Studies⟫, Princeton University Press, 1956, pp. 129–153.",
  "J. E. Hopcroft, “An n log n algorithm for minimizing states in a finite automaton,” in ⟪Theory of Machines and Computations⟫, Academic Press, 1971, pp. 189–196.",
  "T. Berners-Lee, R. Fielding and L. Masinter, “Uniform Resource Identifier (URI): Generic Syntax,” RFC 3986, IETF, 2005.",
  "A. Costello, “Punycode: A Bootstring encoding of Unicode for Internationalized Domain Names in Applications (IDNA),” RFC 3492, IETF, 2003.",
  "Python Software Foundation, “re: Regular expression operations” and “urllib.parse: Parse URLs into components,” ⟪Python 3 Documentation⟫.",
];
const references = [
  H1("References"),
  ...refs.map((r) => new Paragraph({ children: runs(r), numbering: { reference: "refs", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 300 } })),
];

const appendix = [
  H1("Appendix A: Project Files and How to Run"),
  ...table(["File", "Contents"], [
    ["`phishing_detector/automata.py`", "Regex parser, alphabet compression, NFA construction, subset construction, minimisation, DFA class"],
    ["`phishing_detector/detector.py`", "URL parser, pattern catalogue, structural rules, scoring and classification"],
    ["`app.py`", "Flask server and JSON API"],
    ["`website/index.html`", "Self-contained website with the JavaScript port of the engine"],
    ["`evaluate.py`", "Reproduces all experiments; writes `results/results.json` and `results/results.md`"],
    ["`build_site.py`", "Injects the results into the website"],
    ["`tests/test_automata.py`", "17 unit tests"],
  ], [3400, 5626], "Project files", { size: 19 }),
  ...code([
    "pip install flask pytest",
    "python -m pytest tests          # 17 tests",
    "python evaluate.py              # regenerate all results",
    "python build_site.py            # put the results into the website",
    "python app.py                   # open http://127.0.0.1:5000",
  ]),
  P("The website can also be opened directly from `website/index.html` without a server, because it runs the same automata in the browser."),
];

// ======================================================================
const doc = new Document({
  creator: "Nilay Sengupta, Adwit Agarwal",
  title: "Rule-Based Phishing URL Detector Using Finite Automata",
  description: "Model of Computation project report",
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: FONT, color: ACCENT }, paragraph: { spacing: { before: 120, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 27, bold: true, font: FONT }, paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, italics: true, font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "arch", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "refs", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "[%1]", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 620 } } } }] },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: cover,
    },
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, pageNumbers: { start: 1 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Rule-Based Phishing URL Detector Using Finite Automata", italics: true, size: 18, color: "666666" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] }) },
      children: [...abstract, ...contents, ...intro, ...theory, ...model, ...results, ...discussion, ...conclusion, ...references, ...appendix],
    },
  ],
});

const words = abstractText.split(/\s+/).filter(Boolean).length;
Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "MOC_Project_Report_Phishing_URL_Detector.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out, "| abstract words:", words, "| figures:", figN, "| tables:", tabN);
});
