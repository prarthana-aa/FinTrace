import Papa from 'papaparse';

// Loads the three files the generator wrote into /public and normalises types.
// Timestamps have no timezone, so Date.parse treats them as local time — fine,
// since detection only ever uses *differences* between timestamps.
export async function loadData() {
  const [accText, txText, gt] = await Promise.all([
    fetch('accounts.csv').then((r) => {
      if (!r.ok) throw new Error('accounts.csv not found');
      return r.text();
    }),
    fetch('transactions.csv').then((r) => {
      if (!r.ok) throw new Error('transactions.csv not found');
      return r.text();
    }),
    fetch('ground_truth.json').then((r) => {
      if (!r.ok) throw new Error('ground_truth.json not found');
      return r.json();
    }),
  ]);

  const accounts = Papa.parse(accText, { header: true, skipEmptyLines: true }).data.map((r) => ({
    account_id: r.account_id,
    type: r.type,
    category: r.category || '',
    age_days: parseInt(r.age_days, 10),
    is_mule: String(r.is_mule).toLowerCase() === 'true',
  }));

  const transactions = Papa.parse(txText, { header: true, skipEmptyLines: true }).data.map((r) => ({
    txn_id: r.txn_id,
    sender_id: r.sender_id,
    receiver_id: r.receiver_id,
    amount: parseFloat(r.amount),
    timestamp: r.timestamp,
    ts: Date.parse(r.timestamp) / 1000,
  }));

  const plantedMules = gt.mule_account_ids || [];
  return { accounts, transactions, plantedMules };
}
