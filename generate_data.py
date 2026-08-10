#!/usr/bin/env python3
"""
generate_data.py  --  TrustGraph synthetic data generator
==========================================================

Produces three files that the TrustGraph web app loads:

    public/accounts.csv       account_id, type, category, age_days, is_mule
    public/transactions.csv   txn_id, sender_id, receiver_id, amount, timestamp
    public/ground_truth.json  { "mule_account_ids": [...] }

Design goal
-----------
Build a realistic NORMAL layer first, then plant ONE mule ring in which every
single transaction looks individually unremarkable but the *shape* of the money
flow is damning:

    ~30 unrelated normal source accounts
            |  (each sends ONE payment IN, within a 1-hour window)
            v
    2 COLLECTOR mules            <- huge fan-IN, funds held for minutes
            |
            v  (forwarded within minutes)
    5 INTERMEDIARY mules         <- pass-through, tiny hold time
            |
            v  (fanned OUT within minutes)
    12 CASH-OUT mules            <- receive then "withdraw" immediately
            |
            v
    withdrawals to payments-bank wallets

Only the 19 collector/intermediary/cash-out accounts are marked is_mule=true.
The 30 sources stay is_mule=false (they are victims / unwitting senders).

Everything is seeded, so runs are byte-for-byte reproducible.
"""

import csv
import json
import math
import os
import random
from datetime import datetime, timedelta

# ─────────────────────────────────────────────────────────────────────────────
#  CONSTANTS  (tune the whole demo from here)
# ─────────────────────────────────────────────────────────────────────────────
SEED = 42

# --- account population --------------------------------------------------------
N_PERSONAL       = 220        # normal personal accounts
N_MERCHANT       = 40         # merchant accounts (have a category)
N_PAYMENTS_BANK  = 6          # payments-bank / wallet accounts (aggregators)

# borderline legitimate accounts with some suspicious-looking behavior
N_BORDERLINE_FAMILY  = 1
N_BORDERLINE_GIG     = 2
N_BORDERLINE_TRADERS = 2
N_BORDERLINE_TOTAL   = (N_BORDERLINE_FAMILY + N_BORDERLINE_GIG +
                        N_BORDERLINE_TRADERS)

# --- normal transaction volume -------------------------------------------------
N_TRANSACTIONS   = 3500       # approx. number of NORMAL-layer transactions

# --- ring layout ---------------------------------------------------------------
N_RINGS            = 1        # how many rings to plant
RING_SOURCES       = 30       # unrelated normal senders feeding the ring
RING_COLLECTORS    = 2        # top-layer collector mules (high fan-in)
RING_INTERMEDIARIES= 5        # middle-layer pass-through mules
RING_CASHOUT       = 12       # bottom-layer cash-out mules
RING_WAVES         = 4        # separate inbound waves to the same collectors
RING_WAVE_DAY_OFFSETS = [20, 23, 26, 28]
# mules per ring = collectors + intermediaries + cashout  (= 19 by default)

# --- money / timing ------------------------------------------------------------
REPORTING_THRESHOLD = 50000   # ₹ amount at/above which a txn would be reported
STRUCT_BAND_LOW     = 0.90    # "just under" band = [0.90*T, T)  ->  [45000, 50000)
RING_TIME_WINDOW    = 3600    # seconds: source->collector burst window (1 hour)
HOP_DELAY_MIN       = 60      # seconds: min delay for a downstream forward
HOP_DELAY_MAX       = 600     # seconds: max delay for a downstream forward
MULE_AGE_MIN        = 5       # days: mule accounts are freshly opened
MULE_AGE_MAX        = 45

# --- simulation window ---------------------------------------------------------
SIM_DAYS   = 30
DATA_END   = datetime(2025, 6, 1, 9, 0, 0)          # fixed for reproducibility
DATA_START = DATA_END - timedelta(days=SIM_DAYS)
RING_START = datetime.combine((DATA_START + timedelta(days=RING_WAVE_DAY_OFFSETS[0])).date(),
                              datetime.min.time()) + timedelta(hours=14)  # 14:00, buried in business hours

OUTPUT_DIR = "public"         # web app fetches the files from here

# Merchant categories -> plausible per-transaction amount range (₹)
MERCHANT_CATEGORIES = {
    "grocery":     (80, 2500),
    "restaurant":  (150, 3000),
    "fuel":        (300, 6000),
    "pharmacy":    (50, 3000),
    "apparel":     (300, 12000),
    "utilities":   (200, 8000),
    "electronics": (800, 55000),
    "travel":      (500, 45000),
}

STRUCT_LOW = STRUCT_BAND_LOW * REPORTING_THRESHOLD   # 45000
# Business-hours weighting for timestamps (index = hour 0..23)
HOUR_WEIGHTS = [
    1, 1, 1, 1, 1, 2,      # 00-05 night
    4, 7, 10, 12, 13, 13,  # 06-11 morning ramp / peak
    12, 11, 11, 12, 12, 13,# 12-17 afternoon
    12, 10, 8, 5, 3, 2,    # 18-23 evening taper
]


# ─────────────────────────────────────────────────────────────────────────────
#  small helpers
# ─────────────────────────────────────────────────────────────────────────────
def lognorm(median, sigma):
    """Log-normal draw with a given median (₹)."""
    return median * math.exp(sigma * random.gauss(0.0, 1.0))


def business_time():
    """A timestamp inside the sim window, weighted toward business hours."""
    day = random.randint(0, SIM_DAYS - 1)
    hour = random.choices(range(24), weights=HOUR_WEIGHTS, k=1)[0]
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return DATA_START + timedelta(days=day, hours=hour, minutes=minute, seconds=second)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def struct_amount():
    """An amount deliberately parked just under the reporting threshold."""
    return round(random.uniform(STRUCT_LOW + 200, REPORTING_THRESHOLD - 100), 2)


# ─────────────────────────────────────────────────────────────────────────────
#  build accounts
# ─────────────────────────────────────────────────────────────────────────────
def build_accounts():
    """
    Returns (accounts, roles) where:
      accounts : list of dicts with id/type/category/age_days/is_mule
      roles    : dict of id-lists  {personal, merchant, bank, sources,
                                    collectors, intermediaries, cashout}
    Account IDs are shuffled so a mule's role is never guessable from its id.
    """
    n_mules = RING_COLLECTORS + RING_INTERMEDIARIES + RING_CASHOUT
    total = (N_PERSONAL + N_MERCHANT + N_PAYMENTS_BANK +
             n_mules * N_RINGS + N_BORDERLINE_TOTAL)

    ids = [f"ACC{n:05d}" for n in range(1, total + 1)]
    random.shuffle(ids)
    cur = iter(ids)

    accounts, roles = [], {
        "personal": [], "merchant": [], "bank": [],
        "sources": [], "collectors": [], "intermediaries": [], "cashout": [],
        "borderline": [],
        "borderline_info": {
            "family_remittance_hub": None,
            "gig_worker_hubs": [],
            "small_traders": [],
        },
    }

    # normal personal
    for _ in range(N_PERSONAL):
        aid = next(cur)
        accounts.append(dict(account_id=aid, type="personal", category="",
                             age_days=random.randint(120, 2200), is_mule=False))
        roles["personal"].append(aid)

    # merchants
    cats = list(MERCHANT_CATEGORIES)
    for _ in range(N_MERCHANT):
        aid = next(cur)
        accounts.append(dict(account_id=aid, type="merchant",
                             category=random.choice(cats),
                             age_days=random.randint(200, 2600), is_mule=False))
        roles["merchant"].append(aid)

    # payments-bank / wallet aggregators (legitimately high fan-in/out)
    for _ in range(N_PAYMENTS_BANK):
        aid = next(cur)
        accounts.append(dict(account_id=aid, type="payments_bank", category="",
                             age_days=random.randint(900, 3000), is_mule=False))
        roles["bank"].append(aid)

    # borderline legitimate accounts with mild suspicious-looking signals
    family_id = next(cur)
    accounts.append(dict(account_id=family_id, type="personal", category="",
                         age_days=random.randint(800, 1200), is_mule=False))
    roles["personal"].append(family_id)
    roles["borderline"].append(family_id)
    roles["borderline_info"]["family_remittance_hub"] = family_id

    for _ in range(N_BORDERLINE_GIG):
        aid = next(cur)
        accounts.append(dict(account_id=aid, type="personal", category="",
                             age_days=random.randint(400, 800), is_mule=False))
        roles["personal"].append(aid)
        roles["borderline"].append(aid)
        roles["borderline_info"]["gig_worker_hubs"].append(aid)

    for _ in range(N_BORDERLINE_TRADERS):
        aid = next(cur)
        accounts.append(dict(account_id=aid, type="merchant",
                             category=random.choice(["apparel", "electronics"]),
                             age_days=random.randint(400, 1800), is_mule=False))
        roles["merchant"].append(aid)
        roles["borderline"].append(aid)
        roles["borderline_info"]["small_traders"].append(aid)

    # mule accounts: young personal accounts, is_mule=true
    for _ in range(n_mules * N_RINGS):
        aid = next(cur)
        accounts.append(dict(account_id=aid, type="personal", category="",
                             age_days=random.randint(MULE_AGE_MIN, MULE_AGE_MAX),
                             is_mule=True))

    # slice the mule pool into roles (per ring)
    mule_ids = [a["account_id"] for a in accounts if a["is_mule"]]
    mi = iter(mule_ids)
    for _ in range(N_RINGS):
        roles["collectors"].extend(next(mi) for _ in range(RING_COLLECTORS))
        roles["intermediaries"].extend(next(mi) for _ in range(RING_INTERMEDIARIES))
        roles["cashout"].extend(next(mi) for _ in range(RING_CASHOUT))

    # sources are ordinary personal accounts (victims), sampled without replacement
    non_borderline_personal = [p for p in roles["personal"] if p not in roles["borderline"]]
    roles["sources"] = random.sample(non_borderline_personal, RING_SOURCES * N_RINGS)

    return accounts, roles


# ─────────────────────────────────────────────────────────────────────────────
#  normal transaction layer
# ─────────────────────────────────────────────────────────────────────────────
def build_normal_layer(roles):
    """P2P + personal->merchant + salary inflows + wallet loads."""
    txns = []
    personal, merchants, banks = roles["personal"], roles["merchant"], roles["bank"]
    cat_of = {a: c for a, c in _merchant_category_map(roles)}

    # ---- friend graph so P2P fan-in stays small & human ----
    friends = {p: random.sample([q for q in personal if q != p],
                                random.randint(1, 5)) for p in personal}

    # budget split across the normal transaction types
    n_salary = len(personal)                     # ~1 payday per person in the window
    n_wallet = int(N_TRANSACTIONS * 0.06)        # wallet top-ups into payments banks
    n_p2p    = int(N_TRANSACTIONS * 0.20)        # peer-to-peer
    n_shop   = max(0, N_TRANSACTIONS - n_salary - n_wallet - n_p2p)

    # 1) monthly salary-like inflows: payments_bank -> person, near start of window
    for p in personal:
        payday = DATA_START + timedelta(days=random.randint(0, 3),
                                        hours=random.choice([9, 10, 11]),
                                        minutes=random.randint(0, 59))
        amt = max(18000, min(62000, lognorm(38000, 0.28)))
        txns.append((random.choice(banks), p, round(amt, 2), payday))

    # 2) wallet loads: person -> payments_bank (small, dilutes bank structuring)
    for _ in range(n_wallet):
        txns.append((random.choice(personal), random.choice(banks),
                     round(max(50, lognorm(900, 0.7)), 2), business_time()))

    # 3) peer-to-peer between friends
    for _ in range(n_p2p):
        a = random.choice(personal)
        b = random.choice(friends[a])
        if random.random() < 0.5:
            a, b = b, a
        txns.append((a, b, round(max(30, lognorm(750, 0.8)), 2), business_time()))

    # 4) personal -> merchant spending, amount inside the merchant's category range
    for _ in range(n_shop):
        m = random.choice(merchants)
        lo, hi = MERCHANT_CATEGORIES[cat_of[m]]
        amt = min(hi, max(lo, lognorm((lo + hi) / 2 * 0.6, 0.6)))
        txns.append((random.choice(personal), m, round(amt, 2), business_time()))

    return txns


def build_borderline_layer(roles):
    """Generate legitimate accounts with borderline-looking cashflow patterns."""
    txns = []
    banks = roles["bank"]
    now = DATA_START + timedelta(days=10, hours=12)

    # 1) family remittance hub: many small receipt inflows, pooled monthly to a parent
    family = roles["borderline_info"]["family_remittance_hub"]
    if family:
        relatives = random.sample([p for p in roles["personal"] if p != family], 10)
        parent = random.choice([p for p in roles["personal"] if p not in {family}])
        for i, rel in enumerate(relatives):
            t = DATA_START + timedelta(days=10 + i * 2,
                                       hours=random.choice([10, 11, 12, 13, 14]),
                                       minutes=random.randint(0, 59))
            txns.append((rel, family, round(max(500, lognorm(1400, 0.5)), 2), t))
        for month in range(2, 5):
            t = DATA_START + timedelta(days=5 * month, hours=11, minutes=random.randint(0, 59))
            txns.append((family, parent, round(max(3000, lognorm(7000, 0.5)), 2), t))

    # 2) gig worker hubs: many small customer payments, held longer, not routed quickly
    for gig_id in roles["borderline_info"]["gig_worker_hubs"]:
        customers = random.sample([p for p in roles["personal"] if p != gig_id], 18)
        for i, cust in enumerate(customers):
            t = DATA_START + timedelta(days=8 + i // 3,
                                       hours=random.choice([9, 10, 11, 17, 18]),
                                       minutes=random.randint(0, 59))
            txns.append((cust, gig_id, round(max(200, lognorm(900, 0.6)), 2), t))
        # occasional outgoing expense to a merchant/supplies
        for j in range(3):
            t = DATA_START + timedelta(days=12 + j * 6,
                                       hours=random.choice([14, 15, 16]),
                                       minutes=random.randint(0, 59))
            txns.append((gig_id, random.choice(roles["merchant"]),
                         round(max(900, lognorm(2200, 0.5)), 2), t))

    # 3) small traders: merchant-like fan-in and fan-out at modest volumes
    for trader_id in roles["borderline_info"]["small_traders"]:
        suppliers = random.sample([m for m in roles["merchant"] if m != trader_id], 4)
        customers = random.sample(roles["personal"], 10)
        for i, sup in enumerate(suppliers):
            t = DATA_START + timedelta(days=5 + i * 4,
                                       hours=random.choice([9, 10, 11, 13]),
                                       minutes=random.randint(0, 59))
            txns.append((sup, trader_id, round(max(2500, lognorm(6200, 0.4)), 2), t))
        for i, cust in enumerate(customers):
            t = DATA_START + timedelta(days=7 + i * 2,
                                       hours=random.choice([11, 12, 14, 15]),
                                       minutes=random.randint(0, 59))
            txns.append((cust, trader_id, round(max(600, lognorm(2500, 0.45)), 2), t))
        for j in range(2):
            t = DATA_START + timedelta(days=14 + j * 7,
                                       hours=random.choice([16, 17, 18]),
                                       minutes=random.randint(0, 59))
            txns.append((trader_id, random.choice(roles["bank"]),
                         round(max(1800, lognorm(5200, 0.45)), 2), t))

    return txns


def _merchant_category_map(roles):
    # rebuilt lazily from the accounts list is overkill; carry categories via closure
    return _MERCHANT_CATS  # populated in main()


_MERCHANT_CATS = []  # [(merchant_id, category), ...]


# ─────────────────────────────────────────────────────────────────────────────
#  the planted ring
# ─────────────────────────────────────────────────────────────────────────────
def build_ring(roles, ring_index=0):
    """
    One structuring ring. Every amount sits just under the reporting threshold;
    every hop happens minutes after the money arrives.
    """
    txns = []

    spr = RING_SOURCES
    srcs = roles["sources"][ring_index * spr:(ring_index + 1) * spr]
    cols = roles["collectors"][ring_index * RING_COLLECTORS:(ring_index + 1) * RING_COLLECTORS]
    ints = roles["intermediaries"][ring_index * RING_INTERMEDIARIES:(ring_index + 1) * RING_INTERMEDIARIES]
    cash = roles["cashout"][ring_index * RING_CASHOUT:(ring_index + 1) * RING_CASHOUT]

    wave_sizes = [RING_SOURCES // RING_WAVES + (1 if i < RING_SOURCES % RING_WAVES else 0)
                  for i in range(RING_WAVES)]
    src_index = 0

    def hop(after):
        return after + timedelta(seconds=random.uniform(HOP_DELAY_MIN, HOP_DELAY_MAX))

    assign = {ci: ints[ci % len(ints)] for ci in range(len(cash))}
    banks = roles["bank"]

    for wave_index, wave_size in enumerate(wave_sizes):
        wave_base = datetime.combine((DATA_START + timedelta(days=RING_WAVE_DAY_OFFSETS[wave_index])).date(),
                                     datetime.min.time()) + timedelta(hours=14)

        wave_srcs = srcs[src_index:src_index + wave_size]
        src_index += wave_size

        # 1) sources -> collectors, one payment each, inside a 1-hour window (burst)
        last_in = {c: wave_base for c in cols}
        for i, s in enumerate(wave_srcs):
            c = cols[i % len(cols)]
            t = wave_base + timedelta(seconds=random.uniform(0, RING_TIME_WINDOW))
            txns.append((s, c, struct_amount(), t))
            last_in[c] = max(last_in[c], t)

        # 2) collectors -> every intermediary, minutes after the last inflow lands
        int_in = {m: wave_base for m in ints}
        for c in cols:
            for m in ints:
                t = hop(last_in[c])
                txns.append((c, m, struct_amount(), t))
                int_in[m] = max(int_in[m], t)

        # 3) intermediaries -> cash-out mules (fan-OUT); spread 12 across 5 mules
        cash_in = {}
        for ci, co in enumerate(cash):
            m = assign[ci]
            t = hop(int_in[m])
            txns.append((m, co, struct_amount(), t))
            cash_in[co] = t

        # 4) cash-out mules -> withdrawal to a payments-bank wallet, minutes later
        for co in cash:
            t = hop(cash_in[co])
            txns.append((co, random.choice(banks), struct_amount(), t))

    return txns


# ─────────────────────────────────────────────────────────────────────────────
#  main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    random.seed(SEED)

    accounts, roles = build_accounts()

    # publish merchant categories for the normal layer closure
    global _MERCHANT_CATS
    _MERCHANT_CATS = [(a["account_id"], a["category"])
                      for a in accounts if a["type"] == "merchant"]

    txns = build_normal_layer(roles)
    txns += build_borderline_layer(roles)
    for r in range(N_RINGS):
        txns += build_ring(roles, r)

    # sort by time and assign transaction ids
    txns.sort(key=lambda x: x[3])
    rows = [dict(txn_id=f"TXN{n:06d}", sender_id=s, receiver_id=rcv,
                 amount=amt, timestamp=iso(t))
            for n, (s, rcv, amt, t) in enumerate(txns, start=1)]

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # accounts.csv
    with open(os.path.join(OUTPUT_DIR, "accounts.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["account_id", "type", "category", "age_days", "is_mule"])
        for a in accounts:
            w.writerow([a["account_id"], a["type"], a["category"],
                        a["age_days"], str(a["is_mule"]).lower()])

    # transactions.csv
    with open(os.path.join(OUTPUT_DIR, "transactions.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["txn_id", "sender_id", "receiver_id", "amount", "timestamp"])
        for r in rows:
            w.writerow([r["txn_id"], r["sender_id"], r["receiver_id"],
                        f"{r['amount']:.2f}", r["timestamp"]])

    # ground_truth.json
    planted = sorted(a["account_id"] for a in accounts if a["is_mule"])
    with open(os.path.join(OUTPUT_DIR, "ground_truth.json"), "w") as f:
        json.dump({
            "mule_account_ids": planted,
            "n_rings": N_RINGS,
            "ring_roles": {
                "collectors": roles["collectors"],
                "intermediaries": roles["intermediaries"],
                "cashout": roles["cashout"],
            },
            "reporting_threshold": REPORTING_THRESHOLD,
        }, f, indent=2)

    # console summary
    wave_days = [str((DATA_START + timedelta(days=offset)).date())
                 for offset in RING_WAVE_DAY_OFFSETS]
    print("TrustGraph data generated (seed = %d)" % SEED)
    print("  accounts     :", len(accounts),
          "(personal %d, merchant %d, payments_bank %d, mules %d)"
          % (N_PERSONAL, N_MERCHANT, N_PAYMENTS_BANK, len(planted)))
    print("  transactions :", len(rows))
    print("  planted mules:", len(planted))
    print("  ring wave days:", ", ".join(wave_days))
    print("  borderline ids:", ", ".join(sorted(roles["borderline"])))
    print("  files written: %s/accounts.csv, %s/transactions.csv, %s/ground_truth.json"
          % (OUTPUT_DIR, OUTPUT_DIR, OUTPUT_DIR))


if __name__ == "__main__":
    main()
