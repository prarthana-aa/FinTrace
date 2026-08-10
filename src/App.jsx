import { useEffect, useMemo, useRef, useState } from 'react';
import GraphView from './components/GraphView.jsx';
import SidePanel from './components/SidePanel.jsx';
import { computeSignals, DEFAULT_THRESHOLD } from './detection.js';
import { loadData } from './dataLoader.js';

const REPLAY_DELAY_MS = 30; // ms per transaction for a ~90-120s replay
const REPLAY_BATCH_SIZE = 1;
const MAX_EVENT_ROWS = 40;

function findPlantedNetworks(plantedIds, transactions) {
  const plantedSet = new Set(plantedIds);
  const adjacency = new Map(plantedIds.map((id) => [id, new Set()]));
  for (const tx of transactions) {
    if (plantedSet.has(tx.sender_id) && plantedSet.has(tx.receiver_id)) {
      adjacency.get(tx.sender_id).add(tx.receiver_id);
      adjacency.get(tx.receiver_id).add(tx.sender_id);
    }
  }

  const visited = new Set();
  const groups = [];
  for (const id of plantedIds) {
    if (visited.has(id)) continue;
    const stack = [id];
    const group = [];
    visited.add(id);
    while (stack.length) {
      const node = stack.pop();
      group.push(node);
      for (const neighbor of adjacency.get(node)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function buildFirstSeenMap(transactions) {
  const map = new Map();
  for (let index = 0; index < transactions.length; index += 1) {
    const tx = transactions[index];
    for (const id of [tx.sender_id, tx.receiver_id]) {
      if (!map.has(id)) map.set(id, index);
    }
  }
  return map;
}

function createEvent(message, label) {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, message, label };
}

function formatAmount(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function transactionTimestamp(tx) {
  const date = new Date(tx.timestamp);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const day = String(Math.min(30, Math.max(1, Math.floor((new Date(tx.timestamp) - new Date(tx.timestamp).setUTCHours(0, 0, 0, 0)) / (24 * 3600 * 1000)) + 1)));
  return `Day ${day}, ${hh}:${mm}`;
}

function transactionLabel(tx) {
  if (!tx) return 'Day 0, 00:00';
  const date = new Date(tx.timestamp);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const day = Math.min(30, Math.max(1, Math.floor((date.getTime() - new Date(tx.timestamp).setUTCHours(0, 0, 0, 0)) / (24 * 3600 * 1000)) + 1));
  return `Day ${day}, ${hh}:${mm}`;
}

function buildFlaggedNetworks(flaggedIds, transactions) {
  const adjacency = new Map();
  for (const id of flaggedIds) adjacency.set(id, new Set());

  const relevantTx = transactions.filter(
    (tx) => flaggedIds.has(tx.sender_id) && flaggedIds.has(tx.receiver_id)
  );

  for (const tx of relevantTx) {
    adjacency.get(tx.sender_id).add(tx.receiver_id);
    adjacency.get(tx.receiver_id).add(tx.sender_id);
  }

  const visited = new Set();
  const groups = [];
  for (const id of flaggedIds) {
    if (visited.has(id)) continue;
    const stack = [id];
    const group = new Set([id]);
    visited.add(id);
    while (stack.length) {
      const node = stack.pop();
      for (const neighbor of adjacency.get(node) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
          group.add(neighbor);
        }
      }
    }
    if (group.size > 0) {
      const edgeCount = relevantTx.filter(
        (tx) => group.has(tx.sender_id) && group.has(tx.receiver_id)
      ).length;
      groups.push({ ids: group, edgeCount });
    }
  }

  groups.sort((a, b) => b.ids.size - a.ids.size);
  return groups;
}

function getNetworkSummary(groups) {
  if (groups.length === 0) return { count: 0, largestSize: 0, largestEdges: 0 };
  return {
    count: groups.length,
    largestSize: groups[0].ids.size,
    largestEdges: groups[0].edgeCount,
  };
}

export default function App() {
  const [data, setData] = useState(null);
  const [scores, setScores] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [highlight, setHighlight] = useState(false);
  const [demoStep, setDemoStep] = useState(null); // null | 0 | 1 | 2 | 3
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData()
      .then((d) => {
        setData(d);
        setScores(computeSignals(d.accounts, d.transactions));
      })
      .catch((e) => setError(e.message));
  }, []);

  const accountsById = useMemo(
    () => (data ? new Map(data.accounts.map((account) => [account.id, account])) : new Map()),
    [data]
  );

  const sortedTransactions = useMemo(() => {
    if (!data) return [];
    const arr = [...data.transactions];
    arr.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    return arr.map((tx, index) => ({ ...tx, _index: index }));
  }, [data]);

  const totalTx = sortedTransactions.length;

  const allGraphData = useMemo(() => {
    if (!scores || !data) return { nodes: [], links: [] };
    const nodes = [...scores.values()].map((s) => ({
      id: s.id,
      type: s.type,
      score: s.score,
      degree: s.fanIn + s.fanOut,
    }));
    const links = sortedTransactions.map((tx) => ({
      id: `${tx.sender_id}->${tx.receiver_id}@${tx._index}`,
      source: tx.sender_id,
      target: tx.receiver_id,
      tx,
    }));
    return { nodes, links };
  }, [scores, data, sortedTransactions]);

  const flaggedSet = useMemo(() => {
    const s = new Set();
    if (scores) for (const v of scores.values()) if (v.score >= threshold) s.add(v.id);
    return s;
  }, [scores, threshold]);

  const getTopFlaggedId = () => {
    if (!scores) return null;
    let best = null;
    for (const id of flaggedSet) {
      const s = scores.get(id);
      if (!s) continue;
      if (best === null || s.score > scores.get(best).score) best = id;
    }
    return best;
  };

  const plantedSet = useMemo(() => (data ? new Set(data.plantedMules) : new Set()), [data]);
  const plantedGroups = useMemo(
    () => (data ? findPlantedNetworks(data.plantedMules, sortedTransactions) : []),
    [data, sortedTransactions]
  );
  const firstSeenIndex = useMemo(() => buildFirstSeenMap(sortedTransactions), [sortedTransactions]);

  const getTransactionLabel = (index) => {
    if (index < 0 || index >= sortedTransactions.length) return 'Day 0, 00:00';
    const tx = sortedTransactions[index];
    const ts = Number(tx.ts) * 1000;
    const date = new Date(ts);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const day = Math.min(30, Math.max(1, Math.floor((Number(tx.ts) - Number(sortedTransactions[0].ts)) / (24 * 3600)) + 1));
    return `Day ${day}, ${hh}:${mm}`;
  };

  const demoCaptions = [
    '285 accounts, 3,564 transactions — individually, nothing looks wrong.',
    'Turn on the shape. Fan-in, hold, fan-out — the ring separates itself.',
    "Here's the ring TrustGraph found — 19 accounts, 0 false positives.",
    'And here\'s exactly why — no black box, every point on the score traces back to a rule.',
  ];

  const applyDemoStep = (step) => {
    if (step === 0) {
      setHighlight(false);
      setSelectedId(null);
    }
    if (step === 1) {
      setHighlight(true);
      setSelectedId(null);
    }
    if (step === 2) {
      setHighlight(true);
      setSelectedId(null);
    }
    if (step === 3) {
      setHighlight(true);
      const top = getTopFlaggedId();
      setSelectedId(top);
    }
  };

  const handlePlayDemo = () => {
    applyDemoStep(0);
    setDemoStep(0);
  };

  const handleNextDemo = () => {
    if (demoStep === null) return;
    const next = demoStep + 1;
    if (next > 3) {
      setDemoStep(null);
      return;
    }
    applyDemoStep(next);
    setDemoStep(next);
  };

  const handleExitDemo = () => {
    setDemoStep(null);
  };

  const stats = useMemo(() => {
    if (!scores || !data) return null;
    const plantedSet = new Set(data.plantedMules);
    let caught = 0;
    for (const id of flaggedSet) if (plantedSet.has(id)) caught += 1;
    return {
      accounts: data.accounts.length,
      transactions: data.transactions.length,
      flagged: flaggedSet.size,
      caught,
      planted: data.plantedMules.length,
      fp: flaggedSet.size - caught,
    };
  }, [scores, data, flaggedSet]);

  // ---- Replay mode state and logic ----
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [events, setEvents] = useState([]);
  const [latestTransaction, setLatestTransaction] = useState(null);
  const [caughtCount, setCaughtCount] = useState(0);
  const [freshLinkIds, setFreshLinkIds] = useState(new Set());
  const freshLinkTimersRef = useRef(new Map());
  const previousLiveScoreRef = useRef(new Map());
  const previousNetworkStateRef = useRef({ count: 0, largestSize: 0, largestEdges: 0 });

  const [liveScores, setLiveScores] = useState(null);

  const liveFlaggedSet = useMemo(() => {
    const set = new Set();
    if (!liveScores) return set;
    for (const [id, record] of liveScores.entries()) {
      if (record.score >= threshold) set.add(id);
    }
    return set;
  }, [liveScores, threshold]);

  const liveConfirmedIds = useMemo(() => {
    const set = new Set();
    if (!data) return set;
    for (const id of liveFlaggedSet) {
      if (plantedSet.has(id)) set.add(id);
    }
    return set;
  }, [liveFlaggedSet, plantedSet]);

  const liveFalsePositiveIds = useMemo(() => {
    const set = new Set();
    if (!data) return set;
    for (const id of liveFlaggedSet) {
      if (!plantedSet.has(id)) set.add(id);
    }
    return set;
  }, [liveFlaggedSet, plantedSet]);

  const visibleTransactions = useMemo(() => sortedTransactions.slice(0, replayIndex), [sortedTransactions, replayIndex]);

  const liveNetworkGroups = useMemo(
    () => buildFlaggedNetworks(liveFlaggedSet, visibleTransactions),
    [liveFlaggedSet, visibleTransactions]
  );

  const liveNetworkSummary = useMemo(() => getNetworkSummary(liveNetworkGroups), [liveNetworkGroups]);

  const liveFlaggedCount = liveFlaggedSet.size;

  const falsePositiveCandidates = useMemo(() => {
    if (!scores) return [];
    return [...scores.values()]
      .filter((s) => !s.isMule)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => s.id);
  }, [scores]);


  const replayStats = useMemo(() => ({
    accounts: data?.accounts.length || 0,
    transactions: replayIndex,
    flagged: liveFlaggedSet.size,
    caught: Array.from(liveFlaggedSet).filter((id) => plantedSet.has(id)).length,
    planted: data?.plantedMules.length || 0,
    fp: liveFalsePositiveIds.size,
  }), [data, replayIndex, liveFlaggedSet, liveFalsePositiveIds, plantedSet]);

  useEffect(() => {
    if (replayIndex > totalTx) setReplayIndex(totalTx);
  }, [totalTx]);

  const effectiveGraphData = useMemo(() => {
    return allGraphData || { nodes: [], links: [] };
  }, [allGraphData]);

  useEffect(() => {
    if (!data) return;
    if (visibleTransactions.length === 0) {
      setLiveScores(null);
      return;
    }
    const scoresNow = computeSignals(data.accounts, visibleTransactions);
    setLiveScores(scoresNow);
  }, [visibleTransactions, data]);

  useEffect(() => {
    if (!data || !liveScores) return;

    if (replayIndex === 0) {
      setEvents([]);
      setLatestTransaction(null);
      setCaughtCount(0);
      previousLiveScoreRef.current = new Map();
      previousNetworkStateRef.current = { count: 0, largestSize: 0, largestEdges: 0 };
      setFreshLinkIds(new Set());
      freshLinkTimersRef.current.forEach((timeout) => clearTimeout(timeout));
      freshLinkTimersRef.current.clear();
      return;
    }

    const tx = sortedTransactions[replayIndex - 1];
    if (!tx) return;

    setLatestTransaction(tx);
    const linkId = `${tx.sender_id}->${tx.receiver_id}@${tx._index}`;
    setFreshLinkIds((prev) => new Set(prev).add(linkId));
    const timeoutId = window.setTimeout(() => {
      setFreshLinkIds((prev) => {
        const next = new Set(prev);
        next.delete(linkId);
        return next;
      });
      freshLinkTimersRef.current.delete(linkId);
    }, 600);
    freshLinkTimersRef.current.set(linkId, timeoutId);

    const prevScores = previousLiveScoreRef.current;
    const senderPrev = prevScores.get(tx.sender_id) ?? { score: 0 };
    const receiverPrev = prevScores.get(tx.receiver_id) ?? { score: 0 };
    const senderScore = liveScores.get(tx.sender_id);
    const receiverScore = liveScores.get(tx.receiver_id);
    const label = transactionLabel(tx);

    const nextEvents = [];
    if (senderScore && senderScore.score >= threshold && senderPrev.score < threshold) {
      const statusText = plantedSet.has(tx.sender_id)
        ? 'FLAGGED — suspicious money-flow pattern'
        : 'FLAGGED BY RULES';
      nextEvents.push(
        createEvent(
          `${tx.sender_id} crossed risk threshold\n${senderPrev.score.toFixed(0)} → ${senderScore.score.toFixed(0)}\n${statusText}`,
          label
        )
      );
    }

    if (receiverScore && receiverScore.score >= threshold && receiverPrev.score < threshold) {
      const statusText = plantedSet.has(tx.receiver_id)
        ? 'FLAGGED — suspicious money-flow pattern'
        : 'FLAGGED BY RULES';
      nextEvents.push(
        createEvent(
          `${tx.receiver_id} crossed risk threshold\n${receiverPrev.score.toFixed(0)} → ${receiverScore.score.toFixed(0)}\n${statusText}`,
          label
        )
      );
    }

    if (liveNetworkSummary.count > previousNetworkStateRef.current.count) {
      nextEvents.push(
        createEvent(
          `Flagged network count increased to ${liveNetworkSummary.count}`,
          label
        )
      );
    } else if (liveNetworkSummary.largestSize > previousNetworkStateRef.current.largestSize) {
      nextEvents.push(
        createEvent(
          `Largest flagged cluster grew to ${liveNetworkSummary.largestSize} accounts`,
          label
        )
      );
    }

    nextEvents.push(
      createEvent(
        `${tx.sender_id} → ${tx.receiver_id}\n${formatAmount(tx.amount)}`,
        label
      )
    );

    setEvents((prev) => [...nextEvents, ...prev].slice(0, MAX_EVENT_ROWS));
    previousLiveScoreRef.current.set(tx.sender_id, senderScore || senderPrev);
    previousLiveScoreRef.current.set(tx.receiver_id, receiverScore || receiverPrev);
    previousNetworkStateRef.current = liveNetworkSummary;
    setCaughtCount(Array.from(liveFlaggedSet).filter((id) => plantedSet.has(id)).length);
  }, [replayIndex, data, liveScores, sortedTransactions, threshold, plantedSet, liveFlaggedSet, liveNetworkSummary]);

  useEffect(() => {
    if (data && scores) {
      setReplayMode(true);
      setReplayIndex(0);
      setReplayPlaying(true);
    }
  }, [data, scores]);

  useEffect(() => {
    if (!replayPlaying) return undefined;
    if (replayIndex >= totalTx) {
      setReplayPlaying(false);
      return undefined;
    }
    const id = setInterval(() => {
      setReplayIndex((i) => {
        const next = Math.min(totalTx, i + REPLAY_BATCH_SIZE);
        if (next >= totalTx) setReplayPlaying(false);
        return next;
      });
    }, REPLAY_DELAY_MS);
    return () => clearInterval(id);
  }, [replayPlaying, totalTx]);

  const handleStartReplay = () => {
    setReplayMode(true);
    setReplayIndex(0);
    setReplayPlaying(true);
  };
  const handlePauseResume = () => setReplayPlaying((p) => !p);
  const handleResetReplay = () => {
    setReplayPlaying(false);
    setReplayIndex(0);
  };

  const minTs = sortedTransactions.length ? Number(sortedTransactions[0].ts) : 0;
  const currentTs = replayIndex > 0 && replayIndex <= sortedTransactions.length ? Number(sortedTransactions[Math.max(0, replayIndex - 1)].ts) : minTs;
  const totalDays = 30;
  const dayNum = totalDays === 0 ? 1 : Math.min(totalDays, Math.max(1, Math.floor((currentTs - minTs) / (24 * 3600)) + 1));

  if (error) {
    return (
      <div className="err">
        <b>Could not load data.</b>
        <br />
        {error}
        <br />
        <br />
        Run <code>python generate_data.py</code> first so the CSV/JSON files exist in <code>public/</code>, then reload.
      </div>
    );
  }

  if (!scores || !stats) {
    return <div className="loading">Loading network and running rule-based scan…</div>;
  }

  const selectedScored = selectedId ? scores.get(selectedId) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          TrustGraph<span>· mule-ring detection by money-flow shape (rule-based, no ML)</span>
        </div>
        <div className="legend">
          <span><i className="dot" style={{ background: '#6b7fd7' }} />personal</span>
          <span><i className="dot" style={{ background: '#22c39a' }} />merchant</span>
          <span><i className="dot" style={{ background: '#b57bff' }} />payments bank</span>
          <span><i className="dot" style={{ background: '#ff4d5e' }} />flagged</span>
        </div>
        <div className="play-area">
          <button className="play-demo" onClick={handlePlayDemo}>▶ Play demo</button>
        </div>
      </header>

      <div className="banner">
        <div className="stat">
          <div className="k">Accounts</div>
          <div className="v">{stats.accounts}</div>
        </div>
        <div className="stat">
          <div className="k">Transactions</div>
          <div className="v">{stats.transactions.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="k">Flagged</div>
          <div className="v">{replayStats.flagged}</div>
        </div>
        <div className="stat catch">
          <div className="k">Caught planted mules</div>
          <div className="v">
            {replayStats.caught} / {replayStats.planted}
          </div>
        </div>
        <div className={`stat fp ${replayStats.fp === 0 ? 'zero' : ''}`}>
          <div className="k">False positives</div>
          <div className="v">{replayStats.fp}</div>
        </div>
      </div>

      <div className="controls">
        <div className="toggle" onClick={() => setHighlight((h) => !h)}>
          <div className={`switch ${highlight ? 'on' : ''}`}>
            <div className="knob" />
          </div>
          <span className="label">Highlight flagged</span>
        </div>
        <div className="slider-wrap">
          <label>Risk threshold</label>
          <input
            type="range"
            min="0"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <span className="thval">{threshold}</span>
        </div>
        <span className="hint">Ring stays cleanly separated for any threshold ~2–54 · lowest mule ≈ 54, highest normal ≈ 2</span>
        <div className="replay-area">
          {!replayMode && (
            <button className="replay-btn" onClick={handleStartReplay}>▶ Replay</button>
          )}
          {replayMode && (
            <div className="replay-controls">
              <button onClick={handlePauseResume}>{replayPlaying ? 'Pause' : 'Resume'}</button>
              <button onClick={handleResetReplay}>Reset</button>
              <input
                className="replay-scrub"
                type="range"
                min="0"
                max={totalTx}
                value={replayIndex}
                onChange={(e) => {
                  setReplayIndex(Number(e.target.value));
                  setReplayPlaying(false);
                }}
              />
              <div className="replay-counter">showing {replayIndex} / {totalTx} transactions · Day {dayNum} of {totalDays} · {liveFlaggedCount} flagged so far</div>
            </div>
          )}
        </div>
        {demoStep !== null && (
          <div className="demo-controls">
            <button className="next" onClick={handleNextDemo}>Next →</button>
            <button className="exit" onClick={handleExitDemo}>✕ Exit demo</button>
          </div>
        )}
      </div>

      <div className="main">
        <div className="graph-wrap">
          {demoStep !== null && (
            <div className="demo-banner">{demoCaptions[demoStep]}</div>
          )}
          <GraphView
            graphData={effectiveGraphData}
            flaggedSet={flaggedSet}
            highlight={highlight}
            demoStep={demoStep}
            focusIds={demoStep === 2 ? Array.from(flaggedSet) : null}
            selectedId={selectedId}
            replayMode={replayMode}
            replayIndex={replayIndex}
            freshLinkIds={freshLinkIds}
            liveFlaggedSet={liveFlaggedSet}
            onSelect={(id) => {
              if (demoStep !== null) setDemoStep(null);
              setSelectedId(id);
            }}
            onExitDemo={handleExitDemo}
          />
        </div>
        <SidePanel
          scored={selectedScored}
          transactions={data.transactions}
          scores={scores}
          threshold={threshold}
          caught={replayStats.caught}
          planted={replayStats.planted}
          flaggedCount={replayStats.flagged}
          events={events}
        />
      </div>
    </div>
  );
}
