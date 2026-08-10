import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { SIGNAL_ORDER, WEIGHTS, explain, signalDetail, neighborhood } from '../detection.js';

const COLORS = { personal: '#6b7fd7', merchant: '#22c39a', payments_bank: '#b57bff' };
const FLAG = '#ff4d5e';
const TAU = 2 * Math.PI;

function MiniGraph({ selectedId, transactions, scores }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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

export default function SidePanel({ scored, transactions, scores, threshold, caught, planted, flaggedCount }) {
  if (!scored) {
    return (
      <aside className="panel">
        <h2>Detection summary</h2>
        <p className="empty">
          Rule-based scan complete. <span className="found">Caught {caught} of {planted} planted mules</span> with{' '}
          {flaggedCount - caught} false positive{flaggedCount - caught === 1 ? '' : 's'} at threshold {threshold}.
          <br />
          <br />
          Flip <b>Highlight flagged</b> to turn the ring red and watch the fan-in → fan-out funnel separate from the
          hairball. Drag the <b>risk threshold</b> to re-flag live.
          <br />
          <br />
          <span className="kbd">Click any node</span> to see exactly which signals fired and why.
        </p>
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
