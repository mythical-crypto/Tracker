const day = 24 * 60 * 60 * 1000;

export function retainSnapshots(snapshots, now = Date.now()) {
  const recent = [];
  const daily = new Map();
  const weekly = new Map();
  for (const snapshot of snapshots) {
    const time = Date.parse(snapshot.at);
    if (!Number.isFinite(time)) throw new Error(`Некорректная дата снимка: ${snapshot.at}`);
    if (time >= now - 2 * day) {
      recent.push(snapshot);
    } else if (time >= now - 92 * day) {
      daily.set(new Date(time).toISOString().slice(0, 10), snapshot);
    } else {
      const date = new Date(time);
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      weekly.set(date.toISOString().slice(0, 10), snapshot);
    }
  }
  return [...weekly.values(), ...daily.values(), ...recent].sort((a, b) => a.at.localeCompare(b.at)).slice(-240);
}
