import { useEffect, useMemo, useState } from 'react';
import GraphView from './components/GraphView.jsx';
import SidePanel from './components/SidePanel.jsx';
import { computeSignals, DEFAULT_THRESHOLD } from './detection.js';
import { loadData } from './dataLoader.js';

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

  const graphData = useMemo(() => {
    if (!scores || !data) return { nodes: [], links: [] };
    const nodes = [...scores.values()].map((s) => ({
      id: s.id,
      type: s.type,
      score: s.score,
      degree: s.fanIn + s.fanOut,
    }));
    const links = data.transactions.map((t) => ({ source: t.sender_id, target: t.receiver_id }));
    return { nodes, links };
  }, [scores, data]);

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
    const planted = data.plantedMules;
    const plantedSet = new Set(planted);
    let caught = 0;
    for (const id of flaggedSet) if (plantedSet.has(id)) caught += 1;
    return {
      accounts: data.accounts.length,
      transactions: data.transactions.length,
      flagged: flaggedSet.size,
      caught,
      planted: planted.length,
      fp: flaggedSet.size - caught,
    };
  }, [scores, data, flaggedSet]);

  // ---- Replay mode state and logic ----
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);

  // Tunables
  const REPLAY_DELAY_MS = 40; // ms per transaction tick (30-60ms recommended)
  const RECOMPUTE_EVERY = 1; // recompute live signals every N transactions

  const sortedTransactions = useMemo(() => {
    if (!data) return [];
    const arr = [...data.transactions];
    arr.sort((a, b) => Number(a.ts) - Number(b.ts));
    return arr;
  }, [data]);

  const totalTx = sortedTransactions.length;

  useEffect(() => {
    if (replayIndex > totalTx) setReplayIndex(totalTx);
  }, [totalTx]);

  const visibleTransactions = useMemo(() => {
    // always slice by replayIndex; replayMode toggles whether to reveal incrementally
    return sortedTransactions.slice(0, replayIndex);
  }, [sortedTransactions, replayIndex]);

  const effectiveGraphData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    const links = visibleTransactions.map((t) => ({ source: t.sender_id, target: t.receiver_id }));
    return { nodes: graphData.nodes, links };
  }, [graphData, visibleTransactions]);

  // live scores computed on revealed transactions so far
  const [liveScores, setLiveScores] = useState(null);
  useEffect(() => {
    if (!data) return;
    // recompute live signals on the currently revealed tx slice
    if (visibleTransactions.length === 0) {
      setLiveScores(null);
      return;
    }
    // recompute every RECOMPUTE_EVERY ticks (or when scrubbed)
    // here RECOMPUTE_EVERY is 1, so run per-tick
    const scoresNow = computeSignals(data.accounts, visibleTransactions);
    setLiveScores(scoresNow);
  }, [visibleTransactions, data]);

  const liveFlaggedSet = useMemo(() => {
    const s = new Set();
    if (!liveScores) return s;
    for (const v of liveScores.values()) if (v.score >= DEFAULT_THRESHOLD) s.add(v.id);
    return s;
  }, [liveScores]);

  const liveFlaggedCount = liveFlaggedSet.size;

  // start automatic replay once data and scores are ready
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
        const next = Math.min(totalTx, i + 1);
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
          <div className="v">{stats.flagged}</div>
        </div>
        <div className="stat catch">
          <div className="k">Caught planted mules</div>
          <div className="v">
            {stats.caught} / {stats.planted}
          </div>
        </div>
        <div className={`stat fp ${stats.fp === 0 ? 'zero' : ''}`}>
          <div className="k">False positives</div>
          <div className="v">{stats.fp}</div>
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
            liveFlaggedSet={liveFlaggedSet}
            onSelect={(id) => {
              // manual selection during demo should exit demo
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
          caught={stats.caught}
          planted={stats.planted}
          flaggedCount={stats.flagged}
        />
      </div>
    </div>
  );
}
