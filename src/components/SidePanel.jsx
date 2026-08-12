import { useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { SIGNAL_ORDER, WEIGHTS, explain, signalDetail, neighborhood } from '../detection.js';
import LiveFeed from './LiveFeed.jsx';

const COLORS = { personal: '#6b7fd7', merchant: '#22c39a', payments_bank: '#b57bff' };
const FLAG = '#ff4d5e';
const AMBER = '#ffb347';
const TAU = 2 * Math.PI;

function MiniGraph({ selectedId, transactions, scores }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const { nodeIds, links } = neighborhood(selectedId, transactions);
    const nodes = nodeIds.map((id) => ({ id, type: scores.get(id)?.type || 'personal' }));
    return { nodes, links: links.map((l) => ({ ...l })) };
  }, [selectedId, transactions, scores]);

  return (
    <div className="mini" ref={ref}>
      {w > 0 && (
        <ForceGraph2D
          key={selectedId}
          width={w}
          height={260}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          nodeId="id"
          nodeLabel={(n) => n.id}
          nodeRelSize={4}
          nodeCanvasObject={(node, ctx, scale) => {
            const isSel = node.id === selectedId;
            const r = isSel ? 6 : 4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, TAU);
            ctx.fillStyle = isSel ? FLAG : COLORS[node.type] || '#8894a8';
            ctx.fill();
            if (isSel) {
              ctx.lineWidth = 2 / scale;
              ctx.strokeStyle = '#fff';
              ctx.stroke();
            }
          }}
          linkColor={() => 'rgba(160,175,200,0.35)'}
          linkWidth={1}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          cooldownTicks={80}
          d3VelocityDecay={0.3}
        />
      )}
    </div>
  );
}

function renderMetric(label, value, tone = 'normal') {
  return (
    <div className={`metric ${tone}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

export default function SidePanel({ scored, transactions, scores, threshold, caught, planted, flaggedCount, events, latestDetection, timeline, replayStats, totalTx, replayPlaying, ringStages = [], ringMoneyFlow = 0 }) {
  const falseCount = flaggedCount - caught;
  const timelineItems = timeline.slice(0, 6);
  const formattedRingMoneyFlow = ringMoneyFlow === 0
    ? '₹0'
    : `₹${ringMoneyFlow.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const visibleRingStages = ringStages.filter((stage) => stage.key !== 'intermediary');

  if (!scored) {
    return (
      <aside className="panel">
        <h2>Detection summary</h2>
        <div className="dashboard-metrics">
          {renderMetric('Transactions', `${replayStats.transactions.toLocaleString()} / ${totalTx.toLocaleString()}`)}
          {renderMetric('Flagged', replayStats.flagged)}
          {renderMetric('False positives', replayStats.fp, replayStats.fp ? 'warn' : 'normal')}
          {renderMetric('Scam networks', replayStats.networks)}
          {renderMetric('Accounts in networks', replayStats.accountsInNetworks)}
        </div>

        <div className="ring-card">
          <div className="ring-card-head">
            <span>MULE RING PATH</span>
            <span className="ring-flow"><small>TOTAL MONEY FLOW</small>{formattedRingMoneyFlow}</span>
          </div>
          <div className="ring-flow-note">Money flowing through detected ring</div>
          <div className="ring-stages">
            {visibleRingStages.map((stage, index) => (
                <div className={`ring-stage ${stage.discovered ? 'discovered' : 'locked'}`} key={stage.key}>
                  {index > 0 && <div className="ring-arrow">↓</div>}
                  <div className="ring-stage-label">{stage.discovered ? '● ' : '○ '}{stage.label}</div>
                  {stage.discovered ? (
                    <>
                      <div className="ring-stage-ids">{stage.ids.join(' · ')}</div>
                      <div className="ring-stage-note">discovered</div>
                    </>
                  ) : <div className="ring-stage-note">Waiting...</div>}
                </div>
            ))}
          </div>
        </div>

        {latestDetection && (
          <div className="latest-detection">
            <div className="latest-title">LATEST DETECTION</div>
            <div className="latest-card">
              <div className="latest-badge">{latestDetection.title}</div>
              {latestDetection.account && <div className="latest-account">{latestDetection.account}</div>}
              {latestDetection.scoreFrom !== null && (
                <div className="latest-score">Score {latestDetection.scoreFrom} → {latestDetection.scoreTo}</div>
              )}
              {latestDetection.lines && (
                <div className="latest-reason">{latestDetection.lines.slice(0, 2).join(' · ')}</div>
              )}
              <div className="latest-time">{latestDetection.label}</div>
            </div>
          </div>
        )}

        <div className="timeline-panel">
          <div className="timeline-title">DETECTION TIMELINE</div>
          {timelineItems.length === 0 ? (
            <div className="timeline-empty">Waiting for first meaningful detection…</div>
          ) : (
            <div className="timeline-list">
              {timelineItems.map((item) => (
                <div className="timeline-row" key={item.id}>
                  <span className="timeline-dot">●</span>
                  <div>
                    <div className="timeline-copy">{item.title.replace('🕸 ', '')}</div>
                    <div className="timeline-time">{item.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <LiveFeed events={events} />
      </aside>
    );
  }

  const flagged = scored.score >= threshold;
  return (
    <aside className="panel">
      <h2>Account detail</h2>
      <div className="acct-id">
        {scored.id}
        {scored.isMule ? <span className="pill mule">planted mule</span> : <span className="pill clean">not planted</span>}
      </div>
      <div className="acct-sub">
        {scored.type}
        {scored.category ? ` · ${scored.category}` : ''} · age {scored.ageDays}d · {scored.inCount} in / {scored.outCount} out
      </div>

      <div className="scorebox">
        <div className="big" style={{ color: flagged ? FLAG : '#e7ecf3' }}>
          {scored.score.toFixed(0)}
        </div>
        <div className={`flag-tag ${flagged ? 'on' : 'off'}`}>{flagged ? 'FLAGGED' : 'below threshold'}</div>
      </div>

      <div className="reason">{explain(scored, threshold)}</div>

      <div className="why-box">
        <div className="why-title">WHY FLAGGED?</div>
        <div className="why-id">{scored.id}</div>
        <div className="why-sub">Risk score {scored.score.toFixed(0)} / 100</div>
        <div className="why-signals">
          {SIGNAL_ORDER.filter(({ key }) => scored.norm[key] > 0.15).slice(0, 3).map(({ key, label }) => (
            <div key={key} className="why-signal">
              <span className="why-signal-name">{label}</span>
              <span className="why-signal-detail">{signalDetail(key, scored)}</span>
            </div>
          ))}
        </div>
      </div>

      {SIGNAL_ORDER.map(({ key, label }) => {
        const v = scored.norm[key];
        const pts = scored.contrib[key];
        const fired = v > 0.15;
        return (
          <div className="sig" key={key}>
            <div className="row">
              <span className={`name ${fired ? '' : 'dim'}`}>{label}</span>
              <span className="pts">
                {pts.toFixed(1)} / {WEIGHTS[key]}
              </span>
            </div>
            <div className="bar">
              <span className={fired ? 'hot' : ''} style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <div className="detail">{signalDetail(key, scored)}</div>
          </div>
        );
      })}

      <div className="mini-title">Immediate neighborhood</div>
      <MiniGraph selectedId={scored.id} transactions={transactions} scores={scores} />
    </aside>
  );
}
