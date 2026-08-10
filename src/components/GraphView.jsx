import { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const COLORS = { personal: '#6b7fd7', merchant: '#22c39a', payments_bank: '#b57bff' };
const FLAG = '#ff4d5e';
const TAU = 2 * Math.PI;

const radius = (node) => 2 + Math.min(6, Math.sqrt((node.degree || 1)));

export default function GraphView({ graphData, flaggedSet, highlight, selectedId, onSelect, demoStep = null, focusIds = null, onExitDemo = null, replayMode = false, liveFlaggedSet = null }) {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const fittedRef = useRef(false);

  // keep canvas sized to its container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fit once after the first layout settles
  const onEngineStop = useCallback(() => {
    if (!fittedRef.current && fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
      fittedRef.current = true;
    }
  }, []);

  // handle demo-driven camera moves
  useEffect(() => {
    if (demoStep === null || !fgRef.current) return;

    // step 0: overview — zoom to fit whole graph
    if (demoStep === 0) {
      fgRef.current.zoomToFit(600, 50);
      return;
    }

    // step 2: zoom into flagged ring using provided focusIds (array of ids)
    if (demoStep === 2 && Array.isArray(focusIds) && focusIds.length > 0) {
      const set = new Set(focusIds);
      fgRef.current.zoomToFit(800, 80, (node) => set.has(node.id));
      return;
    }
  }, [demoStep, focusIds]);

  const nodeCanvasObject = useCallback(
    (node, ctx, globalScale) => {
      const isFullFlag = flaggedSet.has(node.id);
      const isLiveFlag = !!(liveFlaggedSet && liveFlaggedSet.has(node.id));
      const highlightDim = highlight && !isFullFlag && !isLiveFlag;

      // replay appearance: nodes with no visible edges yet should be dim/small
      const appeared = (() => {
        if (!replayMode) return true;
        const links = graphData && graphData.links ? graphData.links : [];
        for (const l of links) {
          const a = typeof l.source === 'object' ? l.source.id : l.source;
          const b = typeof l.target === 'object' ? l.target.id : l.target;
          if (a === node.id || b === node.id) return true;
        }
        return false;
      })();

      let fill = COLORS[node.type] || '#8894a8';
      if (isLiveFlag) fill = FLAG;
      else if (highlight && isFullFlag) fill = FLAG;
      const baseR = radius(node);
      const r = appeared ? baseR : Math.min(1.5, baseR);

      let alpha = 1;
      if (highlightDim) alpha *= 0.12;
      if (replayMode && !appeared) alpha *= 0.15;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      if (node.id === selectedId) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5 / globalScale;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [flaggedSet, highlight, selectedId, graphData, replayMode, liveFlaggedSet]
  );

  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    const baseR = radius(node);
    const r = (baseR ? baseR : 2) + 1.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, TAU);
    ctx.fill();
  }, []);

  const endId = (e) => (typeof e === 'object' ? e.id : e);

  const linkColor = useCallback(
    (link) => {
      const a = endId(link.source);
      const b = endId(link.target);
      const liveA = liveFlaggedSet && liveFlaggedSet.has(a);
      const liveB = liveFlaggedSet && liveFlaggedSet.has(b);
      if (liveA && liveB) return 'rgba(255,77,94,0.95)';
      if (!highlight) return 'rgba(120,140,170,0.10)';
      const fs = flaggedSet.has(a);
      const ft = flaggedSet.has(b);
      if (fs && ft) return 'rgba(255,77,94,0.85)';
      if (fs || ft) return 'rgba(150,170,200,0.5)';
      return 'rgba(120,140,170,0.035)';
    },
    [flaggedSet, highlight, liveFlaggedSet]
  );

  const linkWidth = useCallback(
    (link) => {
      const a = endId(link.source);
      const b = endId(link.target);
      const liveA = liveFlaggedSet && liveFlaggedSet.has(a);
      const liveB = liveFlaggedSet && liveFlaggedSet.has(b);
      if (liveA && liveB) return 1.8;
      if (!highlight) return 0.5;
      const fs = flaggedSet.has(a);
      const ft = flaggedSet.has(b);
      if (fs && ft) return 1.5;
      if (fs || ft) return 0.8;
      return 0.4;
    },
    [flaggedSet, highlight, liveFlaggedSet]
  );

  return (
    <div className="fg" ref={wrapRef}>
      {dims.w > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          nodeId="id"
          nodeLabel={(n) => `${n.id} · ${n.type} · risk ${Math.round(n.score)}`}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalParticles={0}
          onNodeClick={(n) => {
            if (demoStep !== null && typeof onExitDemo === 'function') onExitDemo();
            onSelect(n.id);
          }}
          onBackgroundClick={() => {
            if (demoStep !== null && typeof onExitDemo === 'function') onExitDemo();
            onSelect(null);
          }}
          cooldownTicks={120}
          warmupTicks={20}
          d3VelocityDecay={0.9}
          autoPauseRedraw={false}
          onEngineStop={onEngineStop}
        />
      )}
    </div>
  );
}
