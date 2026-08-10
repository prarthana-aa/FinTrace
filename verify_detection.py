#!/usr/bin/env python3
"""Refined detection mirror — gate aggregator fan-out, real category/type mismatch."""
import csv, json, statistics
from datetime import datetime

T = 50000
STRUCT_LOW = 0.90 * T
HOLD_FAST_SEC = 1800
FANIN_BASE, FANIN_SAT = 8, 18
FANOUT_BASE, FANOUT_SAT = 6, 12
BURST_BASE, BURST_SAT = 1, 12
YOUNG_AGE = 60
STRUCT_FLOOR = 0.30
MISMATCH_FANIN = 10
W = dict(struct=33, hold=30, fanin=19, velocity=13, fanout=3, mismatch=2)
FLAG_THRESHOLD = 50
CATS = {"grocery":(80,2500),"restaurant":(150,3000),"fuel":(300,6000),
        "pharmacy":(50,3000),"apparel":(300,12000),"utilities":(200,8000),
        "electronics":(800,55000),"travel":(500,45000)}

def clamp(x, lo=0.0, hi=1.0): return max(lo, min(hi, x))

def load():
    acc = {}
    for r in csv.DictReader(open("public/accounts.csv")):
        r["age_days"] = int(r["age_days"]); r["is_mule"] = r["is_mule"] == "true"
        acc[r["account_id"]] = r
    tx = []
    for r in csv.DictReader(open("public/transactions.csv")):
        r["amount"] = float(r["amount"])
        r["ts"] = datetime.fromisoformat(r["timestamp"]).timestamp()
        tx.append(r)
    return acc, tx

def compute(acc, tx):
    ins, outs = {a: [] for a in acc}, {a: [] for a in acc}
    for t in tx:
        outs[t["sender_id"]].append(t); ins[t["receiver_id"]].append(t)
    scored = {}
    for a, meta in acc.items():
        typ = meta["type"]
        agg = typ in ("merchant", "payments_bank")
        senders = {t["sender_id"] for t in ins[a]}
        fan_in = len(senders)
        nonmerch_out = len({t["receiver_id"] for t in outs[a]
                            if acc[t["receiver_id"]]["type"] != "merchant"})
        fan_out = len({t["receiver_id"] for t in outs[a]})
        touching = ins[a] + outs[a]
        band = sum(1 for t in touching if STRUCT_LOW <= t["amount"] < T)
        struct_ratio = band / len(touching) if touching else 0.0

        holds = []
        in_times = sorted(t["ts"] for t in ins[a])
        for o in sorted(outs[a], key=lambda x: x["ts"]):
            prior = [it for it in in_times if it <= o["ts"]]
            if prior: holds.append(o["ts"] - prior[-1])
        median_hold = statistics.median(holds) if holds else None

        times = sorted(t["ts"] for t in touching)
        burst, j = 0, 0
        for i in range(len(times)):
            while times[i] - times[j] > 3600: j += 1
            burst = max(burst, i - j + 1)
        young = meta["age_days"] < YOUNG_AGE

        # --- signal #6: real category / type mismatch ---
        if typ == "merchant":
            lo, hi = CATS.get(meta["category"], (0, 10**9))
            rec = [t["amount"] for t in ins[a]]
            oob = sum(1 for x in rec if x < lo or x > hi) / len(rec) if rec else 0.0
            i_mismatch = oob
        elif typ == "personal":
            i_mismatch = 1.0 if fan_in >= MISMATCH_FANIN else 0.0  # personal acting as a merchant/hub
        else:
            i_mismatch = 0.0

        i_fanin = 0.0 if agg else clamp((fan_in - FANIN_BASE) / (FANIN_SAT - FANIN_BASE))
        i_fanout = 0.0 if agg else clamp((nonmerch_out - FANOUT_BASE) / (FANOUT_SAT - FANOUT_BASE))
        i_hold = clamp((HOLD_FAST_SEC - median_hold) / HOLD_FAST_SEC) if median_hold is not None else 0.0
        i_struct = clamp((struct_ratio - STRUCT_FLOOR) / (1 - STRUCT_FLOOR))
        i_vel = (1.0 if young else 0.0) * clamp((burst - BURST_BASE) / (BURST_SAT - BURST_BASE))

        score = (W["struct"]*i_struct + W["hold"]*i_hold + W["fanin"]*i_fanin +
                 W["velocity"]*i_vel + W["fanout"]*i_fanout + W["mismatch"]*i_mismatch)
        scored[a] = dict(meta=meta, score=round(score,1), fan_in=fan_in, fan_out=fan_out,
                         hold=median_hold, struct=struct_ratio, burst=burst, mm=round(i_mismatch,2))
    return scored

def main():
    acc, tx = load(); scored = compute(acc, tx)
    mules = [a for a,s in scored.items() if s["meta"]["is_mule"]]
    flagged = [a for a,s in scored.items() if s["score"] >= FLAG_THRESHOLD]
    caught = [a for a in flagged if scored[a]["meta"]["is_mule"]]
    fp = [a for a in flagged if not scored[a]["meta"]["is_mule"]]
    print(f"threshold={FLAG_THRESHOLD}  flagged={len(flagged)}  caught={len(caught)}/{len(mules)}  false_positives={len(fp)}")
    lo = min(scored[a]['score'] for a in mules)
    hi = max(scored[a]['score'] for a in scored if not scored[a]['meta']['is_mule'])
    print(f"lowest mule={lo}   highest non-mule={hi}   separation gap={round(lo-hi,1)}")
    print("\nHighest-scoring NON-mules:")
    for a in sorted((x for x in scored if not scored[x]['meta']['is_mule']), key=lambda x:-scored[x]['score'])[:6]:
        s=scored[a]; print(f"  {a} [{s['meta']['type']:13}] score={s['score']:5} fan_in={s['fan_in']:2} struct={s['struct']:.2f} mm={s['mm']}")
    # widest safe threshold band
    safe=[t for t in range(1,100) if all(scored[a]['score']>=t for a in mules) and not any(scored[a]['score']>=t and not scored[a]['meta']['is_mule'] for a in scored)]
    print(f"\nThreshold values giving 19/19 & 0 FP: {min(safe)}..{max(safe)}")

if __name__ == "__main__": main()
