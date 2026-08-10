import fs from 'fs';
import { computeSignals, DEFAULT_THRESHOLD } from './src/detection.js';

const accounts = fs.readFileSync('public/accounts.csv', 'utf8').trim().split('\n').slice(1).map(line => {
  const [account_id, type, category, age_days, is_mule] = line.split(',');
  return { account_id, type, category, age_days: +age_days, is_mule: is_mule === 'true' };
});

const txns = fs.readFileSync('public/transactions.csv', 'utf8').trim().split('\n').slice(1).map(line => {
  const [txn_id, sender_id, receiver_id, amount, timestamp] = line.split(',');
  return {
    txn_id,
    sender_id,
    receiver_id,
    amount: +amount,
    timestamp,
    ts: new Date(timestamp).getTime() / 1000,
  };
});

const scores = computeSignals(accounts, txns);
const above = Array.from(scores.values()).filter(s => s.score >= DEFAULT_THRESHOLD).sort((a, b) => b.score - a.score);
console.log('threshold', DEFAULT_THRESHOLD);
console.log('above threshold count', above.length);
above.slice(0, 50).forEach(s => console.log(s.id, s.score.toFixed(1), s.isMule ? 'mule' : 'legit'));
const legit = above.filter(s => !s.isMule);
console.log('legit above threshold count', legit.length);
console.log('legit top', legit.slice(0, 20).map(s => ({ id: s.id, score: +s.score.toFixed(1) })));
