import csv
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.getcwd(), 'src'))
from detection import computeSignals, DEFAULT_THRESHOLD

accounts = []
with open('public/accounts.csv', newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        accounts.append({
            'account_id': row['account_id'],
            'type': row['type'],
            'category': row['category'],
            'age_days': int(row['age_days']),
            'is_mule': row['is_mule'].strip().lower() == 'true'
        })

transactions = []
with open('public/transactions.csv', newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        transactions.append({
            'txn_id': row['txn_id'],
            'sender_id': row['sender_id'],
            'receiver_id': row['receiver_id'],
            'amount': float(row['amount']),
            'timestamp': row['timestamp'],
            'ts': datetime.strptime(row['timestamp'], '%Y-%m-%dT%H:%M:%S').timestamp()
        })

scores = computeSignals(accounts, transactions)
above = [s for s in scores.values() if s.score >= DEFAULT_THRESHOLD]
above.sort(key=lambda s: (-s.score, s.id))
print('threshold', DEFAULT_THRESHOLD)
print('above threshold count', len(above))
for s in above[:50]:
    print(s.id, f'{s.score:.1f}', 'mule' if s.isMule else 'legit')
legit = [s for s in above if not s.isMule]
print('legit above threshold count', len(legit))
print('legit top', [(s.id, round(s.score, 1)) for s in legit[:10]])
