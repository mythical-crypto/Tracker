export function summarizeCosts(assets, { usdRub = 1 } = {}) {
  const held = assets.filter((asset) => asset.quantity > 0);
  const known = held.filter((asset) => typeof asset.cost === 'number' && Number.isFinite(asset.cost));
  return {
    cost: known.length ? known.reduce((sum, asset) => sum + asset.cost * (asset.currency === 'USD' ? usdRub : 1), 0) : null,
    knownCostCount: known.length,
    costComplete: known.length === held.length,
    costCoverageKey: known.map((asset) => asset.id).sort().join('|'),
  };
}

export function annotateCostCoverage(snapshot, assets) {
  if (snapshot.knownCostCount !== undefined && snapshot.costComplete !== undefined && snapshot.costCoverageKey !== undefined) return snapshot;
  const { cost, ...coverage } = summarizeCosts(assets);
  return { ...snapshot, ...coverage, ...(cost === null ? { cost: null } : {}) };
}
