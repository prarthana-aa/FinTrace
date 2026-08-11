// ─────────────────────────────────────────────────────────────────────────────
// Fintrace detection — fully rule-based, transparent, mirrors verify2.py
//
// Every account gets six independent signals, each normalised to 0..1, then
// combined by fixed weights into a 0..100 risk score. Nothing is learned; every
// point on the score can be traced back to a plain-English reason.
// ─────────────────────────────────────────────────────────────────────────────

export const T = 50000; // reporting threshold (₹)
export const STRUCT_LOW = 0.9 * T; // "just under" band lower edge = 45000

const HOLD_FAST_SEC = 1800; // <30 min hold => full pass-through score
const FANIN_BASE = 8, FANIN_SAT = 18; // fan-in ramps 8 -> 18
const FANOUT_BASE = 6, FANOUT_SAT = 12; // fan-out ramps 6 -> 12
const BURST_BASE = 1, BURST_SAT = 12; // txns-in-1h ramps 1 -> 12
const YOUNG_AGE = 60; // account younger than this = "young"
const STRUCT_FLOOR = 0.3; // below this structuring share contributes nothing
const MISMATCH_FANIN = 10; // personal acct with >= this many senders = merchant-like

export const WEIGHTS = { struct: 33, hold: 30, fanin: 19, velocity: 13, fanout: 3, mismatch: 2 };
export const DEFAULT_THRESHOLD = 50;

// merchant category -> plausible per-transaction amount band (must match generator)
const CATS = {
  grocery: [80, 2500],
  restaurant: [150, 3000],
  fuel: [300, 6000],
  pharmacy: [50, 3000],
  apparel: [300, 12000],
  utilities: [200, 8000],
  electronics: [800, 55000],
  travel: [500, 45000],
};

// order + labels used by the side panel
export const SIGNAL_ORDER = [
  { key: 'struct', label: 'Structuring' },
  { key: 'hold', label: 'Fast pass-through' },
  { key: 'fanin', label: 'Fan-in' },
  { key: 'velocity', label: 'Velocity vs age' },
  { key: 'fanout', label: 'Fan-out' },
  { key: 'mismatch', label: 'Category / type mismatch' },
];

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const FIRED = 0.15; // a signal "fired" if its normalised value clears this

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return null;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/**
 * @param accounts [{account_id,type,category,age_days,is_mule}]
 * @param transactions [{txn_id,sender_id,receiver_id,amount,ts}]  ts = epoch seconds
 * @returns Map account_id -> scored record
 */
export function computeSignals(accounts, transactions) {
  const acc = new Map(accounts.map((a) => [a.account_id, a]));
  const ins = new Map();
  const outs = new Map();
  for (const a of accounts) {
    ins.set(a.account_id, []);
    outs.set(a.account_id, []);
  }
  for (const t of transactions) {
    if (outs.has(t.sender_id)) outs.get(t.sender_id).push(t);
    if (ins.has(t.receiver_id)) ins.get(t.receiver_id).push(t);
  }

  const result = new Map();
  for (const a of accounts) {
    const id = a.account_id;
    const typ = a.type;
    const inx = ins.get(id);
    const outx = outs.get(id);
    const agg = typ === 'merchant' || typ === 'payments_bank';

    const fanIn = new Set(inx.map((t) => t.sender_id)).size;
    const fanOut = new Set(outx.map((t) => t.receiver_id)).size;
    const nonMerchOut = new Set(
      outx.filter((t) => acc.get(t.receiver_id)?.type !== 'merchant').map((t) => t.receiver_id)
    ).size;

    const touching = inx.concat(outx);
    const band = touching.filter((t) => t.amount >= STRUCT_LOW && t.amount < T).length;
    const structRatio = touching.length ? band / touching.length : 0;

    // median hold-time: for each outflow, gap since the most recent inflow at/before it
    const inTimes = inx.map((t) => t.ts).sort((x, y) => x - y);
    const holds = [];
    for (const o of [...outx].sort((x, y) => x.ts - y.ts)) {
      let prior = null;
      for (let i = inTimes.length - 1; i >= 0; i--) {
        if (inTimes[i] <= o.ts) {
          prior = inTimes[i];
          break;
        }
      }
      if (prior !== null) holds.push(o.ts - prior);
    }
    const medianHold = holds.length ? median(holds) : null;

    // burst: max transactions inside any 1-hour sliding window
    const times = touching.map((t) => t.ts).sort((x, y) => x - y);
    let burst = 0;
    let j = 0;
    for (let i = 0; i < times.length; i++) {
      while (times[i] - times[j] > 3600) j++;
      burst = Math.max(burst, i - j + 1);
    }
    const young = a.age_days < YOUNG_AGE;

    // signal #6 — genuine category / type mismatch
    let iMismatch = 0;
    if (typ === 'merchant') {
      const [lo, hi] = CATS[a.category] || [0, 1e9];
      const rec = inx.map((t) => t.amount);
      iMismatch = rec.length ? rec.filter((x) => x < lo || x > hi).length / rec.length : 0;
    } else if (typ === 'personal') {
      iMismatch = fanIn >= MISMATCH_FANIN ? 1 : 0; // personal acct acting like a merchant/hub
    }

    const iFanin = agg ? 0 : clamp((fanIn - FANIN_BASE) / (FANIN_SAT - FANIN_BASE));
    const iFanout = agg ? 0 : clamp((nonMerchOut - FANOUT_BASE) / (FANOUT_SAT - FANOUT_BASE));
    const iHold = medianHold !== null ? clamp((HOLD_FAST_SEC - medianHold) / HOLD_FAST_SEC) : 0;
    const iStruct = clamp((structRatio - STRUCT_FLOOR) / (1 - STRUCT_FLOOR));
    const iVel = (young ? 1 : 0) * clamp((burst - BURST_BASE) / (BURST_SAT - BURST_BASE));

    const norm = { struct: iStruct, hold: iHold, fanin: iFanin, velocity: iVel, fanout: iFanout, mismatch: iMismatch };
    const contrib = {};
    let score = 0;
    for (const k of Object.keys(WEIGHTS)) {
      contrib[k] = WEIGHTS[k] * norm[k];
      score += contrib[k];
    }

    result.set(id, {
      id,
      type: typ,
      category: a.category,
      ageDays: a.age_days,
      isMule: a.is_mule,
      score,
      fanIn,
      fanOut,
      nonMerchOut,
      medianHold,
      structRatio,
      burst,
      young,
      norm,
      contrib,
      inCount: inx.length,
      outCount: outx.length,
    });
  }
  return result;
}

const fmtK = (n) => `₹${Math.round(n / 1000)}k`;

// per-signal human detail line for the panel
export function signalDetail(key, s) {
  const pct = Math.round(s.structRatio * 100);
  const holdMin = s.medianHold != null ? (s.medianHold / 60).toFixed(1) : null;
  switch (key) {
    case 'struct':
      return `${pct}% of amounts in ${fmtK(STRUCT_LOW)}-${fmtK(T)}`;
    case 'hold':
      return holdMin != null ? `median hold ${holdMin} min` : 'no in->out flow';
    case 'fanin':
      return `${s.fanIn} distinct senders`;
    case 'fanout':
      return `${s.nonMerchOut} distinct non-merchant receivers`;
    case 'velocity':
      return `${s.burst} txns in 1h · account age ${s.ageDays}d${s.young ? '' : ' (not young)'}`;
    case 'mismatch':
      if (s.type === 'personal') return s.norm.mismatch ? 'personal acct with merchant-like fan-in' : '—';
      if (s.type === 'merchant') return `${Math.round(s.norm.mismatch * 100)}% of receipts out of ${s.category} range`;
      return '—';
    default:
      return '';
  }
}

// one-sentence plain-English reason, built only from the signals that fired
export function explain(s, threshold) {
  const flagged = s.score >= threshold;
  const parts = [];
  const pct = Math.round(s.structRatio * 100);
  const holdMin = s.medianHold != null ? (s.medianHold / 60).toFixed(1) : null;

  if (s.norm.struct > FIRED)
    parts.push(`${pct}% of its amounts sit in ${fmtK(STRUCT_LOW)}-${fmtK(T)}, just under the ${fmtK(T)} reporting line (structuring)`);
  if (s.norm.hold > FIRED && holdMin != null)
    parts.push(`money leaves a median of ${holdMin} min after arriving (pass-through)`);
  if (s.norm.fanin > FIRED) parts.push(`receives from ${s.fanIn} distinct senders (fan-in)`);
  if (s.norm.fanout > FIRED) parts.push(`fans out to ${s.nonMerchOut} distinct receivers (fan-out)`);
  if (s.norm.velocity > FIRED)
    parts.push(`${s.burst} transactions inside one hour on a ${s.ageDays}-day-old account (velocity spike)`);
  if (s.norm.mismatch > FIRED && s.type === 'personal')
    parts.push(`it is a personal account behaving like a merchant / collection hub`);
  if (s.norm.mismatch > FIRED && s.type === 'merchant')
    parts.push(`${Math.round(s.norm.mismatch * 100)}% of receipts fall outside its ${s.category} category range`);

  if (!parts.length)
    return `Not flagged (score ${s.score.toFixed(0)}/100). No shape-based signal fired above its noise floor — this looks like ordinary activity.`;

  let joined;
  if (parts.length === 1) joined = parts[0];
  else joined = parts.slice(0, -1).join('; ') + '; and ' + parts[parts.length - 1];

  const head = flagged
    ? `Flagged (score ${s.score.toFixed(0)}/100): this account`
    : `Score ${s.score.toFixed(0)}/100 (below the ${threshold} threshold). Signals present: this account`;
  return `${head} ${joined}.`;
}

// immediate neighbourhood subgraph for the mini-map (parallel edges aggregated)
export function neighborhood(id, transactions) {
  const edges = new Map(); // "a|b" -> {source,target,count,total}
  const nodes = new Set([id]);
  for (const t of transactions) {
    if (t.sender_id !== id && t.receiver_id !== id) continue;
    nodes.add(t.sender_id);
    nodes.add(t.receiver_id);
    const key = `${t.sender_id}|${t.receiver_id}`;
    const e = edges.get(key) || { source: t.sender_id, target: t.receiver_id, count: 0, total: 0 };
    e.count += 1;
    e.total += t.amount;
    edges.set(key, e);
  }
  return { nodeIds: [...nodes], links: [...edges.values()] };
}
