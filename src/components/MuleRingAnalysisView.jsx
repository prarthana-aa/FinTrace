import { useMemo, useState } from 'react';
import { SIGNAL_ORDER, WEIGHTS, explain, signalDetail } from '../detection.js';

const TYPE_COLORS = {
  personal: '#6b7fd7',
  merchant: '#22c39a',
  payments_bank: '#b57bff',
};

function money(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactMoney(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

function timeLabel(tx) {
  const date = new Date(tx.timestamp);
  return date.toLocaleString('en-IN', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function idsFor(structure, key) {
  return structure.stages.find((stage) => stage.key === key)?.ids || [];
}

function makeRoleLookup(structure) {
  const sources = new Set(idsFor(structure, 'entry'));
  const firstLayer = new Set(idsFor(structure, 'collector'));
  const middleLayer = new Set(idsFor(structure, 'intermediary'));
  const cashout = new Set(idsFor(structure, 'cashout'));
  const exits = new Set(idsFor(structure, 'exit'));
  return { sources, firstLayer, middleLayer, cashout, exits };
}

function displayRole(id, roles) {
  if (roles.sources.has(id)) return 'Money Entry';
  if (roles.firstLayer.has(id)) return 'Collector';
  if (roles.middleLayer.has(id)) return 'Collector';
  if (roles.cashout.has(id)) return 'Cash-out';
  if (roles.exits.has(id)) return 'Money Exit';
  return 'External';
}

function transactionStage(tx, roles) {
  if (roles.sources.has(tx.sender_id) && roles.firstLayer.has(tx.receiver_id)) return 'Money Entry';
  if (roles.firstLayer.has(tx.sender_id) && roles.middleLayer.has(tx.receiver_id)) return 'Collector';
  if (roles.middleLayer.has(tx.sender_id) && roles.cashout.has(tx.receiver_id)) return 'Cash-out';
  if (roles.cashout.has(tx.sender_id) && roles.exits.has(tx.receiver_id)) return 'Money Exit';
  return 'All';
}

function SummaryCard({ label, value }) {
  return (
    <div className="analysis-card">
      <div className="analysis-card-label">{label}</div>
      <div className="analysis-card-value">{value}</div>
    </div>
  );
}

function IdGroup({ title, subtitle, ids, tone = 'mule' }) {
  return (
    <div className={`structure-group ${tone}`}>
      <div className="structure-group-title">{title}</div>
      <div className="structure-group-subtitle">{subtitle}</div>
      <div className="structure-id-list">
        {ids.map((id) => <span key={id}>{id}</span>)}
      </div>
    </div>
  );
}

export default function MuleRingAnalysisView({
  data,
  scores,
  threshold,
  replayIndex,
  totalTx,
  transactions,
  ringStructure,
  replayStats,
  onReturnToLive,
}) {
  const [accountFilter, setAccountFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [sortKey, setSortKey] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const [txFilter, setTxFilter] = useState('All');
  const roles = useMemo(() => makeRoleLookup(ringStructure), [ringStructure]);
  const ringIds = ringStructure.ringIds || new Set();
  const accountById = useMemo(() => new Map(data.accounts.map((a) => [a.account_id, a])), [data.accounts]);
  const complete = replayIndex >= totalTx;
  const analysisTransactions = useMemo(
    () => transactions.slice(0, complete ? transactions.length : replayIndex),
    [transactions, replayIndex, complete]
  );
  const fullRingTransactions = useMemo(
    () => transactions.filter((tx) => ringIds.has(tx.sender_id) || ringIds.has(tx.receiver_id)),
    [transactions, ringIds]
  );
  const ringTransactions = useMemo(
    () => analysisTransactions.filter((tx) => ringIds.has(tx.sender_id) || ringIds.has(tx.receiver_id)),
    [analysisTransactions, ringIds]
  );
  const totalDatasetVolume = useMemo(
    () => transactions.reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
  );
  const fullRingVolume = useMemo(
    () => fullRingTransactions.reduce((sum, tx) => sum + tx.amount, 0),
    [fullRingTransactions]
  );
  const visibleRingVolume = useMemo(
    () => ringTransactions.reduce((sum, tx) => sum + tx.amount, 0),
    [ringTransactions]
  );

  const muleRows = useMemo(() => {
    return [...ringIds].map((id) => {
      const incoming = analysisTransactions.filter((tx) => tx.receiver_id === id);
      const outgoing = analysisTransactions.filter((tx) => tx.sender_id === id);
      const score = scores.get(id);
      return {
        id,
        role: displayRole(id, roles),
        type: accountById.get(id)?.type || score?.type || 'personal',
        incomingCount: incoming.length,
        outgoingCount: outgoing.length,
        moneyIn: incoming.reduce((sum, tx) => sum + tx.amount, 0),
        moneyOut: outgoing.reduce((sum, tx) => sum + tx.amount, 0),
        score: score?.score || 0,
        flagged: (score?.score || 0) >= threshold,
      };
    });
  }, [ringIds, analysisTransactions, scores, roles, accountById, threshold]);

  const filteredRows = useMemo(() => {
    const q = accountFilter.trim().toLowerCase();
    const filtered = muleRows.filter((row) => {
      const matchesAccount = !q || row.id.toLowerCase().includes(q);
      const matchesRole = roleFilter === 'All' || row.role === roleFilter;
      return matchesAccount && matchesRole;
    });
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const result = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? result : -result;
    });
  }, [muleRows, accountFilter, roleFilter, sortKey, sortDir]);

  const [selectedId, setSelectedId] = useState(() => muleRows[0]?.id || null);
  const selected = selectedId ? scores.get(selectedId) : null;
  const shownTransactions = ringTransactions
    .map((tx) => ({ ...tx, stage: transactionStage(tx, roles) }))
    .filter((tx) => txFilter === 'All' || tx.stage === txFilter);
  const exitTransactions = transactions.filter((tx) => roles.cashout.has(tx.sender_id) && roles.exits.has(tx.receiver_id));

  const setSort = (key) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="analysis-page">
      <header className="analysis-header">
        <button className="analysis-back" onClick={onReturnToLive}>Back to Live Detection</button>
        <div>
          <h1>Mule Ring — Detailed Analysis</h1>
          <p>Detailed view of the money-flow network detected by FinTrace.</p>
        </div>
      </header>

      {!complete && (
        <div className="analysis-state">Analysis based on transactions revealed so far: {replayIndex.toLocaleString()} / {totalTx.toLocaleString()}</div>
      )}

      <section className="analysis-summary-grid">
        <SummaryCard label="Mule Accounts" value={ringIds.size.toLocaleString()} />
        <SummaryCard label="Mule-linked Transactions" value={ringTransactions.length.toLocaleString()} />
        <SummaryCard label="Money Moved Through Ring" value={money(visibleRingVolume)} />
        <SummaryCard label="Scam Networks" value={replayStats.networks.toLocaleString()} />
        <SummaryCard label="Accounts in Networks" value={replayStats.accountsInNetworks.toLocaleString()} />
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head">
          <h2>Ring Structure</h2>
        </div>
        <div className="structure-flow">
          <IdGroup title="Money Entry" subtitle={`${roles.sources.size} normal source accounts`} ids={[...roles.sources]} tone="source" />
          <IdGroup title="Collector" subtitle={`${roles.firstLayer.size} first-layer mule accounts`} ids={[...roles.firstLayer]} />
          <IdGroup title="Collector" subtitle={`${roles.middleLayer.size} middle-layer mule accounts`} ids={[...roles.middleLayer]} />
          <IdGroup title="Cash-out" subtitle={`${roles.cashout.size} cash-out mule accounts`} ids={[...roles.cashout]} />
          <IdGroup title="Money Exit" subtitle={`${roles.exits.size} payment-bank accounts`} ids={[...roles.exits]} tone="bank" />
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head">
          <h2>Money-flow Visualization</h2>
        </div>
        <div className="flow-lanes">
          {[
            ['Normal/source accounts', roles.sources.size, 'source'],
            ['2 mule accounts', roles.firstLayer.size, 'mule'],
            ['5 mule accounts', roles.middleLayer.size, 'mule'],
            ['12 cash-out mule accounts', roles.cashout.size, 'mule'],
            ['6 payment-bank accounts', roles.exits.size, 'bank'],
          ].map(([label, count, tone], index, arr) => (
            <div className="flow-lane-wrap" key={label}>
              <div className={`flow-lane ${tone}`}>
                <div className="flow-lane-dots">
                  {Array.from({ length: Math.min(Number(count), 12) }).map((_, i) => <span key={i} />)}
                </div>
                <div className="flow-lane-label">{label}</div>
                <div className="flow-lane-count">{count}</div>
              </div>
              {index < arr.length - 1 && <div className="flow-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head">
          <h2>Account Analysis</h2>
          <div className="analysis-filters">
            <input value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} placeholder="Filter account" />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option>All</option>
              <option>Collector</option>
              <option>Cash-out</option>
            </select>
          </div>
        </div>
        <div className="analysis-grid-two">
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  {[
                    ['id', 'Account ID'],
                    ['role', 'Role'],
                    ['type', 'Account Type'],
                    ['incomingCount', 'Incoming Transactions'],
                    ['outgoingCount', 'Outgoing Transactions'],
                    ['moneyIn', 'Money In'],
                    ['moneyOut', 'Money Out'],
                    ['score', 'Risk Score'],
                    ['flagged', 'Status'],
                  ].map(([key, label]) => <th key={key} onClick={() => setSort(key)}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className={selectedId === row.id ? 'selected' : ''} onClick={() => setSelectedId(row.id)}>
                    <td>{row.id}</td>
                    <td>{row.role}</td>
                    <td><span className="type-dot" style={{ background: TYPE_COLORS[row.type] || '#8894a8' }} />{row.type}</td>
                    <td>{row.incomingCount}</td>
                    <td>{row.outgoingCount}</td>
                    <td>{money(row.moneyIn)}</td>
                    <td>{money(row.moneyOut)}</td>
                    <td>{row.score.toFixed(1)}</td>
                    <td><span className={row.flagged ? 'status-flagged' : 'status-muted'}>{row.flagged ? 'Flagged mule' : 'Mule account'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="risk-panel">
            {selected ? (
              <>
                <div className="risk-panel-id">{selected.id}</div>
                <div className="risk-panel-meta">Risk Score: {selected.score.toFixed(1)} / 100</div>
                <div className="risk-panel-meta">Status: {selected.score >= threshold ? 'FLAGGED' : 'BELOW THRESHOLD'}</div>
                <div className="risk-signals">
                  {SIGNAL_ORDER.map(({ key, label }) => {
                    const pts = selected.contrib[key] || 0;
                    const max = WEIGHTS[key] || 1;
                    return (
                      <div className="risk-signal" key={key}>
                        <div className="risk-signal-row"><span>{label}</span><span>{pts.toFixed(1)} / {max}</span></div>
                        <div className="risk-bar"><span style={{ width: `${Math.min(100, (pts / max) * 100)}%` }} /></div>
                        <div className="risk-detail">{signalDetail(key, selected)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="risk-total">TOTAL RISK SCORE <span>{selected.score.toFixed(1)}</span></div>
                <div className="risk-explain">{explain(selected, threshold)}</div>
              </>
            ) : <div className="analysis-empty">Select a mule account.</div>}
          </aside>
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head">
          <h2>Ring Transactions</h2>
          <div className="analysis-filter-buttons">
            {['All', 'Money Entry', 'Collector', 'Cash-out', 'Money Exit'].map((filter) => (
              <button key={filter} className={txFilter === filter ? 'active' : ''} onClick={() => setTxFilter(filter)}>{filter}</button>
            ))}
          </div>
        </div>
        <div className="analysis-table-wrap compact">
          <table className="analysis-table">
            <thead><tr><th>Time</th><th>Sender</th><th>Receiver</th><th>Amount</th><th>Sender Role</th><th>Receiver Role</th></tr></thead>
            <tbody>
              {shownTransactions.map((tx) => (
                <tr key={tx.txn_id}>
                  <td>{timeLabel(tx)}</td>
                  <td>{tx.sender_id}</td>
                  <td>{tx.receiver_id}</td>
                  <td>{money(tx.amount)}</td>
                  <td>{displayRole(tx.sender_id, roles)}</td>
                  <td>{displayRole(tx.receiver_id, roles)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head"><h2>Money Exit Analysis</h2></div>
        <div className="exit-grid">
          {[...roles.exits].map((exitId) => {
            const txs = exitTransactions.filter((tx) => tx.receiver_id === exitId);
            const total = txs.reduce((sum, tx) => sum + tx.amount, 0);
            return (
              <div className="exit-card" key={exitId}>
                <div className="exit-title">Payment Account</div>
                <div className="exit-id">{exitId}</div>
                <div className="exit-subtitle">Received from mule accounts:</div>
                <div className="exit-list">
                  {txs.map((tx) => (
                    <div key={tx.txn_id}><span>{tx.sender_id}</span><span>{money(tx.amount)}</span></div>
                  ))}
                </div>
                <div className="exit-total">Total received <span>{money(total)}</span></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head"><h2>Money Flow Summary</h2></div>
        <div className="flow-summary">
          <div><span>Total dataset transaction volume</span><strong>{money(totalDatasetVolume)}</strong></div>
          <div><span>Full mule-linked transaction volume</span><strong>{money(fullRingVolume)}</strong></div>
          <div><span>Mule-linked transaction count</span><strong>{fullRingTransactions.length.toLocaleString()}</strong></div>
        </div>
      </section>
    </div>
  );
}
