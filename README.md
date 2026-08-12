# FinTrace

**Catching money mule rings by their network flow, not the size of individual transactions.**

Most fraud systems score one transaction at a time: is this amount unusual, is this merchant risky, does this look like a stolen card. That works for a lot of fraud — but it's structurally blind to money muling, because a mule ring is designed so that *every single transaction looks fine on its own*. ₹8,000 from a stranger isn't suspicious. ₹8,000 forwarded within four minutes to five different accounts that then cash out — that's a laundering pipeline, and you can only see it in the network topology.

FinTrace is a prototype that builds that graph, scores every account on six transparent behavioral signals, and lets you watch a mule ring assemble itself in real time.

---

## The idea

1. **Simulate a realistic transaction network.** Hundreds of ordinary personal, merchant, and payments-bank accounts doing normal things, plus one deliberately planted mule ring layered like a real laundering pipeline: entry points → collectors → intermediaries → cash-out accounts → exit.
2. **Score every account with rule-based, explainable signals** — no black-box ML, no training data, every point on the score traces back to a plain-English reason.
3. **Replay the transaction stream live** and watch the graph light up, so you can see the ring's shape emerge before any single transaction would have tripped a threshold-based system.

## Detection engine

Six independent signals, each normalized to 0–1, combined with fixed weights into a 0–100 risk score:

| Signal | What it catches | Weight |
|---|---|---|
| **Structuring** | Share of amounts sitting just under the ₹50,000 reporting threshold (₹45k–₹50k band) | 33 |
| **Fast pass-through** | Money that leaves an account within minutes of arriving (median hold time) | 30 |
| **Fan-in** | Unusually large number of distinct senders | 19 |
| **Velocity vs. age** | Transaction bursts on accounts that are still young | 13 |
| **Fan-out** | Unusually large number of distinct non-merchant receivers | 3 |
| **Category / type mismatch** | A merchant receiving payments outside its plausible category range, or a personal account behaving like a collection hub | 2 |

Every flagged account gets a generated sentence like:

> *Flagged (score 84/100): this account receives from 14 distinct senders (fan-in); money leaves a median of 3.2 min after arriving (pass-through); and 78% of its amounts sit in ₹45k-₹50k, just under the ₹50k reporting line (structuring).*

Nothing is learned from data — the whole engine is inspectable in [`src/detection.js`](src/detection.js), which makes it useful both as a working demo and as a teaching tool for *why* a topology-based approach catches what per-transaction scoring misses.

## What's in the app

- **Live replay** — transactions stream in chronologically, account risk scores update as evidence accumulates, and a live event feed narrates what's happening.
- **Force-directed graph view** — the account network rendered with `react-force-graph-2d`, color-coded by account type and risk, so ring structure is visible at a glance rather than buried in a table.
- **Side panel drill-down** — click any account for its full signal breakdown, contributing evidence, and plain-English explanation.
- **Mule ring analysis view** — a dedicated breakdown of the planted ring once it's detected: entry accounts, collectors, intermediaries, cash-out accounts, and the money's path through each stage.
- **How it works view** — a walkthrough of the detection logic itself, for demoing the engine without needing to read the code.

## Tech stack

- **Frontend:** React + Vite
- **Graph rendering:** react-force-graph-2d
- **Data parsing:** PapaParse (CSV)
- **Detection engine:** plain JS, rule-based, zero dependencies
- **Synthetic data:** Python generator (seeded, reproducible)

## Getting started

```bash
# 1. Generate the synthetic dataset (accounts, transactions, ground truth)
python generate_data.py

# 2. Install frontend dependencies
npm install

# 3. Run the dev server
npm run dev
```

This produces `public/accounts.csv`, `public/transactions.csv`, and `public/ground_truth.json`, which the app loads on startup. Because generation is seeded, every run produces the same network — useful for demos where you want the ring to appear at a predictable point in the replay.

## How the synthetic data is built

`generate_data.py` builds a normal transaction layer first — personal accounts, merchants, payments-bank wallets, plus a handful of borderline-legitimate accounts (families, gig workers, small traders) whose behavior looks *almost* like a mule pattern on purpose, to stress-test false positives. Then it plants exactly one ring on top:

```
~30 unrelated source accounts (victims / unwitting senders)
        │  one payment in, within a 1-hour window
        ▼
  2 COLLECTOR mules        — huge fan-in, funds held for minutes
        │  forwarded within minutes
        ▼
  5 INTERMEDIARY mules     — pure pass-through, near-zero hold time
        │  fanned out within minutes
        ▼
 12 CASH-OUT mules         — receive, then withdraw immediately
        │
        ▼
  withdrawals to payments-bank wallets
```

Only the 19 collector/intermediary/cash-out accounts are labeled `is_mule = true`; the 30 sources are victims and stay unlabeled, since flagging them would be the wrong outcome for a real system.

## Project structure

```
├── generate_data.py              # synthetic account + transaction generator
├── verify_detection.py           # standalone Python check of detection accuracy
├── public/
│   ├── accounts.csv
│   ├── transactions.csv
│   └── ground_truth.json
└── src/
    ├── detection.js              # the six-signal scoring engine
    ├── dataLoader.js             # CSV/JSON loading + normalization
    ├── App.jsx                   # replay loop, view routing, state
    └── components/
        ├── GraphView.jsx             # force-directed network graph
        ├── SidePanel.jsx             # per-account signal breakdown
        ├── LiveFeed.jsx              # streaming event narration
        ├── MuleRingAnalysisView.jsx  # ring structure breakdown
        └── HowItWorksView.jsx        # detection engine walkthrough
```

## Why network topology over transaction scoring

Per-transaction fraud scoring answers "is this transaction weird?" Mule rings are engineered so the answer is almost always no — amounts are kept under reporting thresholds, timing looks plausible, individual counterparties look unremarkable. What doesn't stay hidden is the *shape*: money funneling from many sources into a few accounts, sitting for minutes instead of days, then fanning back out toward cash-out points. FinTrace scores that shape directly, and because every signal is a rule instead of a learned weight, every flag comes with a reason a human reviewer can actually check.

## Status

Prototype built for a fintech conclave expo. Detection logic, data generation, and the ring layering pattern are tuned for demo clarity rather than production traffic volumes — a natural next step would be evaluating the same signal set against real (anonymized) transaction graphs and multiple concurrent rings rather than one planted structure.
