import fs from 'fs';
import path from 'path';
const base = path.resolve('public');
const gt = JSON.parse(fs.readFileSync(path.join(base, 'ground_truth.json'), 'utf8'));
const accText = fs.readFileSync(path.join(base, 'accounts.csv'), 'utf8');
const transactionsText = fs.readFileSync(path.join(base, 'transactions.csv'), 'utf8');
const collectorsSet = new Set(gt.ring_roles?.collectors || []);
const plantedMules = (gt.mule_account_ids || []).filter((id) => !collectorsSet.has(id));
const rows = transactionsText.trim().split('\n').slice(1).map((line) => {
  const [txn_id, sender_id, receiver_id, amount, timestamp] = line.split(',');
  return { txn_id, sender_id, receiver_id, amount: Number(amount), timestamp, ts: Date.parse(timestamp) / 1000 };
});
const plantedSet = new Set(plantedMules);
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
const ringIds = new Set([...plantedMules, ...collectors]);
const stages = [
  { key: 'entry', label: 'MONEY ENTRY', ids: [...new Set(collectors.flatMap((id) => [...inbound.get(id)].filter((from) => !ringIds.has(from))))] },
  { key: 'collector', label: 'COLLECTOR', ids: collectors },
  { key: 'intermediary', label: 'INTERMEDIARY', ids: plantedMules.filter((id) => ![...outbound.get(id)].some((to) => ringIds.has(to)) && [...outbound.get(id)].some((to) => !ringIds.has(to))) },
  { key: 'cashout', label: 'CASH-OUT', ids: plantedMules.filter((id) => ![...outbound.get(id)].some((to) => ringIds.has(to)) && [...outbound.get(id)].some((to) => !ringIds.has(to))) },
  { key: 'exit', label: 'MONEY EXIT', ids: [...new Set([...plantedMules.filter((id) => ![...outbound.get(id)].some((to) => ringIds.has(to)) && [...outbound.get(id)].some((to) => !ringIds.has(to)))].flatMap((id) => [...outbound.get(id)].filter((to) => !ringIds.has(to))))] },
];
const ringStructure = {
  stages,
  entryId: collectors[0] || null,
  exitId: stages[3].ids[0] || null,
  ringIds,
};
console.log('plantedMules count', plantedMules.length);
console.log('plantedMules includes ACC00215?', plantedMules.includes('ACC00215'));
console.log('plantedMules includes ACC00102?', plantedMules.includes('ACC00102'));
console.log('collectors count', collectors.length);
console.log('collectors includes ACC00215?', collectors.includes('ACC00215'));
console.log('collectors includes ACC00102?', collectors.includes('ACC00102'));
console.log('entry stage ids count', stages[0].ids.length);
console.log('entry stage includes ACC00215?', stages[0].ids.includes('ACC00215'));
console.log('entry stage includes ACC00102?', stages[0].ids.includes('ACC00102'));
console.log('collector stage ids count', stages[1].ids.length);
console.log('collector stage includes ACC00215?', stages[1].ids.includes('ACC00215'));
console.log('collector stage includes ACC00102?', stages[1].ids.includes('ACC00102'));
console.log('entryIds sample', stages[0].ids.slice(0, 20));
console.log('collectorIds sample', stages[1].ids.slice(0, 20));
