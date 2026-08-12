import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const COLORS = { personal: '#6b7fd7', merchant: '#22c39a', payments_bank: '#b57bff' };
const FLAG = '#ff4d5e';
const TAU = 2 * Math.PI;

const radius = (node) => {
  const degreeSize = Math.min(4, Math.sqrt(node.degree || 1));
  const riskSize = Math.min(7, (node.score || 0) / 14);

  return 2 + degreeSize + riskSize;
};

export default function GraphView({ graphData, flaggedSet, highlight, selectedId, onSelect, demoStep = null, focusIds = null, onExitDemo = null, replayMode = false, replayIndex = 0, freshLinkIds = new Set(), liveFlaggedSet = null, liveConfirmedIds = null, liveFalsePositiveIds = null, liveNetworkIds = new Set(), ringEntryId = null, ringEntryIds = null, ringExitId = null, ringEntryDiscovered = false, ringExitDiscovered = false }) {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const fittedRef = useRef(false);
  const ringEntrySet = useMemo(() => new Set(ringEntryIds || (ringEntryId ? [ringEntryId] : [])), [ringEntryId, ringEntryIds]);

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
      const isRingEntryNode = ringEntrySet.has(node.id);
      const isFalsePositive = liveFalsePositiveIds && liveFalsePositiveIds.has(node.id);
      const isConfirmed = liveConfirmedIds && liveConfirmedIds.has(node.id);
      const isLiveFlag = isConfirmed || isFalsePositive;
      const isNetwork = liveNetworkIds.has(node.id) && !isFalsePositive;
      const isEntry = highlight && isRingEntryNode && !isFalsePositive;
      const isExit = !isFalsePositive && highlight && ringExitDiscovered && node.id === ringExitId;
      const highlightDim = highlight && !isFullFlag && !isLiveFlag;

      // replay appearance: nodes with no visible edges yet should be dim/small
      const appeared = (() => {
        if (!replayMode) return true;
        const links = graphData && graphData.links ? graphData.links : [];
        for (const l of links) {
          if (typeof l.tx !== 'object' || l.tx._index < replayIndex) {
            const a = typeof l.source === 'object' ? l.source.id : l.source;
            const b = typeof l.target === 'object' ? l.target.id : l.target;
            if (a === node.id || b === node.id) return true;
          }
        }
        return false;
      })();

      let fill = COLORS[node.type] || '#8894a8';
      if (isConfirmed) fill = FLAG;
      else if (isFalsePositive) fill = '#ffb347';
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
      if (highlight && isNetwork && isConfirmed) {
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 3 / globalScale;
        ctx.strokeStyle = 'rgba(255,77,94,0.65)';
        ctx.stroke();
      }
      if (isEntry || isExit) {
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2.5 / globalScale;
        ctx.strokeStyle = '#ff4d5e';
        ctx.setLineDash([4 / globalScale, 3 / globalScale]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${Math.max(8, 10 / globalScale)}px sans-serif`;
        ctx.fillStyle = '#ffb347';
        ctx.fillText(isEntry ? 'RING ENTRY' : 'RING EXIT', node.x + r + 3, node.y - r - 2);
      }
      if (node.id === selectedId) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5 / globalScale;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [flaggedSet, highlight, selectedId, graphData, replayMode, freshLinkIds, replayIndex, liveFlaggedSet, liveConfirmedIds, liveFalsePositiveIds, liveNetworkIds, ringEntrySet, ringExitId, ringEntryDiscovered, ringExitDiscovered]
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
      const isFresh = freshLinkIds.has(link.id);
      if (isFresh) return 'rgba(255,215,90,0.95)';
      if (liveA && liveB) return 'rgba(255,77,94,0.95)';
      if (!replayMode) {
        if (!highlight) return 'rgba(120,140,170,0.10)';
        const fs = flaggedSet.has(a);
        const ft = flaggedSet.has(b);
        if (fs && ft) return 'rgba(255,77,94,0.85)';
        if (fs || ft) return 'rgba(150,170,200,0.5)';
        return 'rgba(120,140,170,0.035)';
      }
      // Hide unrevealed edges during replay
      if (typeof link.tx === 'object' && link.tx._index >= replayIndex) return 'rgba(0,0,0,0)';
      const fs = flaggedSet.has(a);
      const ft = flaggedSet.has(b);
      if (highlight && fs && ft) return 'rgba(255,77,94,0.85)';
      return 'rgba(120,140,170,0.12)';
    },
    [flaggedSet, highlight, liveFlaggedSet, freshLinkIds, replayMode, replayIndex]
  );

  const linkWidth = useCallback(
    (link) => {
      const a = endId(link.source);
      const b = endId(link.target);
      const confirmedA = liveConfirmedIds && liveConfirmedIds.has(a);
      const confirmedB = liveConfirmedIds && liveConfirmedIds.has(b);
      const falseA = liveFalsePositiveIds && liveFalsePositiveIds.has(a);
      const falseB = liveFalsePositiveIds && liveFalsePositiveIds.has(b);
      const liveA = liveFlaggedSet && liveFlaggedSet.has(a);
      const liveB = liveFlaggedSet && liveFlaggedSet.has(b);
      const nodeA = graphData.nodes.find(n => n.id === a);
      const nodeB = graphData.nodes.find(n => n.id === b);

      const riskA = nodeA?.score || 0;
      const riskB = nodeB?.score || 0;

      const maxRisk = Math.max(riskA, riskB);
      const isFresh = freshLinkIds.has(link.id);
      if (maxRisk >= 80) return 3.5;
      if (maxRisk >= 70) return 2.8;
      if (maxRisk >= 50) return 1.8;
      if (isFresh) return 2.2;
      if (typeof link.tx === 'object' && replayMode && link.tx._index >= replayIndex) return 0.25;
      if (confirmedA && confirmedB) return 2.2;
      if (falseA || falseB) return 1.4;
      if (liveA && liveB) return 1.8;
      if (!highlight) return 0.5;
      const fs = flaggedSet.has(a);
      const ft = flaggedSet.has(b);
      if (fs && ft) return 1.5;
      if (fs || ft) return 0.8;
      return 0.4;
    },
    [flaggedSet, highlight, liveFlaggedSet, liveConfirmedIds, liveFalsePositiveIds, freshLinkIds, replayMode, replayIndex]
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
          linkDirectionalParticles={(link) => {
            const a = endId(link.source);
            const b = endId(link.target);

            const suspiciousA =
              liveFlaggedSet && liveFlaggedSet.has(a);

            const suspiciousB =
              liveFlaggedSet && liveFlaggedSet.has(b);

            const flaggedA = flaggedSet.has(a);
            const flaggedB = flaggedSet.has(b);

            return suspiciousA ||
              suspiciousB ||
              flaggedA ||
              flaggedB
              ? 3
              : 1;
          }}
          linkDirectionalParticleSpeed={(link) => {
            const a = endId(link.source);
            const b = endId(link.target);

            const suspicious =
              (liveFlaggedSet && liveFlaggedSet.has(a)) ||
              (liveFlaggedSet && liveFlaggedSet.has(b)) ||
              flaggedSet.has(a) ||
              flaggedSet.has(b);

            return suspicious ? 0.0015 : 0.0005;
          }}
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
