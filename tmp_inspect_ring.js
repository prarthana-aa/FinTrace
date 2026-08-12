const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, 'public');
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
    { key: 'entry', label: 'MONEY ENTRY', ids: entryStageIds },
    { key: 'collector', label: 'COLLECTOR', ids: collectors },
    { key: 'intermediary', label: 'INTERMEDIARY', ids: intermediaries },
    { key: 'cashout', label: 'CASH-OUT', ids: cashout },
    { key: 'exit', label: 'MONEY EXIT', ids: [...new Set(cashout.flatMap((id) => [...outbound.get(id)].filter((to) => !ringIds.has(to))))] },
  ],
  entryId: collectors[0] || null,
  exitId: cashout[0] || null,
  ringIds,
};
console.log('planted count', plantedIds.length);
console.log('collectors count', collectors.length, collectors.slice(0, 20));
console.log('entryStageIds count', entryStageIds.length, entryStageIds.slice(0, 20));
console.log('entryId', structure.entryId);
console.log('collector ids includes ACC00215?', collectors.includes('ACC00215'));
console.log('collector ids includes ACC00102?', collectors.includes('ACC00102'));
console.log('entryStageIds includes ACC00215?', entryStageIds.includes('ACC00215'));
console.log('entryStageIds includes ACC00102?', entryStageIds.includes('ACC00102'));
console.log('entry stage ids sample', structure.stages[0].ids.slice(0,20));
console.log('collector stage ids sample', structure.stages[1].ids.slice(0,20));
fs.writeFileSync(path.resolve(__dirname, 'tmp_inspect_ring_output.json'), JSON.stringify({ collectors, entryStageIds, entryId: structure.entryId }, null, 2));
