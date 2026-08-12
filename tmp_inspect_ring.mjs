import fs from 'fs';
import path from 'path';
const base = path.resolve('public');
const gt = JSON.parse(fs.readFileSync(path.join(base, 'ground_truth.json'), 'utf8'));
const rows = fs.readFileSync(path.join(base, 'transactions.csv'), 'utf8').trim().split('\n').slice(1).map((line) => {
  const [txn_id, sender_id, receiver_id, amount, timestamp] = line.split(',');
  return { txn_id, sender_id, receiver_id, amount: Number(amount), timestamp, ts: Date.parse(timestamp) / 1000 };
});
const plantedIds = gt.mule_account_ids;
const plantedSet = new Set(plantedIds);
const inbound = new Map();
const outbound = new Map();
const ensure = (id) => {
  if (!inbound.has(id)) inbound.set(id, new Set());
  if (!outbound.has(id)) outbound.set(id, new Set());
};
for (const tx of rows) {
  ensure(tx.sender_id);
  ensure(tx.receiver_id);
  inbound.get(tx.receiver_id).add(tx.sender_id);
  outbound.get(tx.sender_id).add(tx.receiver_id);
}
const collectors = [...inbound.keys()].filter((id) => !plantedSet.has(id) && [...outbound.get(id)].some((to) => plantedSet.has(to)));
const ringIds = new Set([...plantedIds, ...collectors]);
const entryStageIds = [...new Set(collectors.flatMap((id) => [...inbound.get(id)].filter((from) => !ringIds.has(from))))];
const cashout = plantedIds.filter((id) => ![...outbound.get(id)].some((to) => ringIds.has(to)) && [...outbound.get(id)].some((to) => !ringIds.has(to)));
const intermediaries = plantedIds.filter((id) => !cashout.includes(id) && [...inbound.get(id)].some((from) => ringIds.has(from)) && [...outbound.get(id)].some((to) => ringIds.has(to)));
const structure = {
  stages: [
    { key: 'entry', label: 'MONEY ENTRY', ids: [...new Set(collectors.flatMap((id) => [...inbound.get(id)].filter((from) => !ringIds.has(from))))] },
    { key: 'collector', label: 'COLLECTOR', ids: collectors },
    { key: 'intermediary', label: 'INTERMEDIARY', ids: intermediaries },
    { key: 'cashout', label: 'CASH-OUT', ids: cashout },
    { key: 'exit', label: 'MONEY EXIT', ids: [...new Set(cashout.flatMap((id) => [...outbound.get(id)].filter((to) => !ringIds.has(to))))] },
  ],
  entryId: collectors[0] || null,
  exitId: cashout[0] || null,
  ringIds,
};
const sortedTransactions = [...rows].sort((a,b)=>a.ts-b.ts).map((tx,index)=>({...tx,_index:index}));
const discoverRingStages = (structure, visibleTransactions, plantedIds) => {
  const [entry, collector, intermediary, cashout, exit] = structure.stages;
  const entryTx = visibleTransactions.filter((tx) => entry.ids.includes(tx.sender_id) && collector.ids.includes(tx.receiver_id));
  const intermediaryTx = visibleTransactions.filter((tx) => collector.ids.includes(tx.sender_id) && intermediary.ids.includes(tx.receiver_id));
  const cashoutTx = visibleTransactions.filter((tx) => intermediary.ids.includes(tx.sender_id) && cashout.ids.includes(tx.receiver_id));
  const exitTx = visibleTransactions.filter((tx) => cashout.ids.includes(tx.sender_id) && exit.ids.includes(tx.receiver_id));
  const discovered = {
    entry: [...new Set(entryTx.map((tx) => tx.sender_id))],
    collector: [...new Set(entryTx.map((tx) => tx.receiver_id))],
    intermediary: [...new Set(intermediaryTx.map((tx) => tx.receiver_id))],
    cashout: [...new Set(cashoutTx.map((tx) => tx.receiver_id))],
    exit: [...new Set(exitTx.map((tx) => tx.receiver_id))],
  };
  return structure.stages.map((stage) => ({
    ...stage,
    ids: discovered[stage.key] || [],
    discovered: (discovered[stage.key] || []).length > 0,
  }));
};
const visibleTransactions = sortedTransactions;
const ringStages = discoverRingStages(structure, visibleTransactions, plantedIds);
console.log('structure entry stage ids count', structure.stages[0].ids.length);
console.log('structure collector stage ids count', structure.stages[1].ids.length);
console.log('structure entry stage first 20', structure.stages[0].ids.slice(0,20));
console.log('structure collector stage first 20', structure.stages[1].ids.slice(0,20));
console.log('structure entryId', structure.entryId);
console.log('entry stage includes ACC00215?', structure.stages[0].ids.includes('ACC00215'));
console.log('entry stage includes ACC00102?', structure.stages[0].ids.includes('ACC00102'));
console.log('collector stage includes ACC00215?', structure.stages[1].ids.includes('ACC00215'));
console.log('collector stage includes ACC00102?', structure.stages[1].ids.includes('ACC00102'));
console.log('ringStages collector discovered', ringStages.find(s=>s.key==='collector').discovered);
console.log('ringStages collector ids count', ringStages.find(s=>s.key==='collector').ids.length);
console.log('ringStages collector ids sample', ringStages.find(s=>s.key==='collector').ids.slice(0,20));
console.log('ringStages entry discovered', ringStages.find(s=>s.key==='entry').discovered);
console.log('ringStages entry ids count', ringStages.find(s=>s.key==='entry').ids.length);
console.log('ringStages entry ids sample', ringStages.find(s=>s.key==='entry').ids.slice(0,20));
console.log('entryIds includes ACC00215?', ringStages.find(s=>s.key==='entry').ids.includes('ACC00215'));
console.log('entryIds includes ACC00102?', ringStages.find(s=>s.key==='entry').ids.includes('ACC00102'));
console.log('collectorIds includes ACC00215?', ringStages.find(s=>s.key==='collector').ids.includes('ACC00215'));
console.log('collectorIds includes ACC00102?', ringStages.find(s=>s.key==='collector').ids.includes('ACC00102'));
console.log('ringEntryDiscovered should be collector discovered keyed by collector stage', ringStages.find(s=>s.key==='collector').discovered);
