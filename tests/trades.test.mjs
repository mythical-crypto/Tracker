import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeLabel, tradeKind } from '../lib/trades.ts';

test('airdrop receipt is labelled separately from a paid purchase', () => {
  assert.equal(tradeLabel({ type: 'buy', purpose: 'AIRDROP' }), 'Airdrop');
  assert.equal(tradeLabel({ type: 'buy' }), 'Покупка');
  assert.equal(tradeLabel({ type: 'sell' }), 'Продажа');
  assert.equal(tradeLabel({ type: 'transfer' }), 'transfer');
});

test('purchase filter excludes airdrop receipts while their own filter includes them', () => {
  const trades = [{ type: 'buy' }, { type: 'buy', purpose: 'AIRDROP' }, { type: 'sell' }];
  assert.deepEqual(trades.filter(t => tradeKind(t) === 'buy'), [trades[0]]);
  assert.deepEqual(trades.filter(t => tradeKind(t) === 'airdrop'), [trades[1]]);
});
