import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCryptoPortfolio, buildSandboxPortfolio, delay, fetchCryptoSource, fetchSteamPrice, transientSourceFailure } from './extra-sources.mjs';

const paths = { sandbox: resolve('data/sandbox.json'), crypto: resolve('data/crypto.json') };

async function readPortfolio(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(path, value) {
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}

export async function refreshSandbox(previous, { now = null, fetchPrice = fetchSteamPrice, pause = delay, clock = () => now ?? new Date().toISOString() } = {}) {
  const prices = {};
  const errors = [];
  const names = [...new Set((previous?.items ?? []).filter((item) => item.quantity > 0).sort((a, b) => (Date.parse(a.updatedAt) || 0) - (Date.parse(b.updatedAt) || 0)).map((item) => item.name))];
  let consecutiveTransientFailures = 0;
  for (const [index, name] of names.entries()) {
    try {
      const price = await fetchPrice(name);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Некорректная цена Steam');
      prices[name] = { price, updatedAt: clock() };
      consecutiveTransientFailures = 0;
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
      consecutiveTransientFailures = transientSourceFailure(error) ? consecutiveTransientFailures + 1 : 0;
      if (consecutiveTransientFailures >= 3) {
        errors.push(...names.slice(index + 1).map((remaining) => `${remaining}: Steam временно недоступен; сохранена прежняя котировка`));
        break;
      }
    }
    if (index < names.length - 1) await pause(4000);
  }
  const completedAt = clock();
  const next = buildSandboxPortfolio({ inventory: null, previous, fetchedAt: completedAt, prices });
  next.attemptedAt = completedAt;
  if (errors.length) {
    next.error = errors.join('; ');
    next.notes = [...next.notes, `Котировки не обновлены для ${errors.length} из ${names.length} позиций; сохранённые значения и даты остались без изменений.`];
  }
  return { portfolio: next, errorCount: errors.length, requestedCount: names.length };
}

export async function refreshCrypto(previous, { now = null, fetchSource = fetchCryptoSource, clock = () => now ?? new Date().toISOString() } = {}) {
  const { group, transactions } = await fetchSource();
  const completedAt = clock();
  const portfolio = buildCryptoPortfolio({ payload: group, transactions, previous, fetchedAt: completedAt });
  portfolio.attemptedAt = completedAt;
  return { portfolio, transactionCount: transactions.length };
}

export async function updateExtras({ sandboxPath = paths.sandbox, cryptoPath = paths.crypto, now = null, logger = console, sandboxRefresh = refreshSandbox, cryptoRefresh = refreshCrypto } = {}) {
  const previousSandbox = await readPortfolio(sandboxPath);
  const previousCrypto = await readPortfolio(cryptoPath);
  if (!previousSandbox || !previousCrypto) throw new Error('Нужны заранее созданные data/sandbox.json и data/crypto.json');

  let successes = 0;
  let sandboxErrors = 0;
  try {
    const sandbox = await sandboxRefresh(previousSandbox, { now });
    await writeJson(sandboxPath, sandbox.portfolio);
    sandboxErrors = sandbox.errorCount;
    if (sandbox.errorCount < sandbox.requestedCount) successes++;
    logger.log(`Steam Sandbox: ${sandbox.requestedCount - sandbox.errorCount}/${sandbox.requestedCount} котировок обновлено`);
  } catch (error) {
    sandboxErrors = previousSandbox.items.filter((item) => item.quantity > 0).length;
    await writeJson(sandboxPath, { ...previousSandbox, freshCount: 0, attemptedAt: now ?? new Date().toISOString(), error: `Steam Sandbox refresh failed: ${error.message}` });
    logger.error(`Steam Sandbox: ${error.message}`);
  }

  try {
    const crypto = await cryptoRefresh(previousCrypto, { now });
    await writeJson(cryptoPath, crypto.portfolio);
    if (crypto.portfolio.freshCount > 0) successes++;
    logger.log(`DropsTab Crypto: ${crypto.transactionCount} сделок, ${crypto.portfolio.items.filter((item) => item.quantity > 0).length} открытых позиций`);
  } catch (error) {
    await writeJson(cryptoPath, { ...previousCrypto, freshCount: 0, attemptedAt: now ?? new Date().toISOString(), error: `DropsTab refresh failed: ${error.message}`, notes: [...previousCrypto.notes.filter(note => !note.startsWith('Последнее обновление DropsTab завершилось ошибкой')), `Последнее обновление DropsTab завершилось ошибкой; сохранены данные от ${previousCrypto.fetchedAt ?? 'неизвестной даты'}.`] });
    logger.error(`DropsTab Crypto: ${error.message}`);
  }
  return { successes, sandboxErrors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  updateExtras().then((result) => { if (!result.successes) process.exitCode = 1; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
