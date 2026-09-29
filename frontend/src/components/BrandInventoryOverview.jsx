import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { subscribeRealtime } from '../utils/realtime';

const FALLBACK_BRANDS = ['Regasco', 'Seagas', 'Pryce'];

// Shared "Inventory Brand Overview" widget.
// Used on both the Inventory Catalog page and the Dashboard so there is a
// single implementation to maintain. Pass a `refreshKey` that changes
// whenever inventory-affecting actions occur (sales, product edits) to
// trigger an automatic refetch.
export default function BrandInventoryOverview({ refreshKey = 0 }) {
  const { showToast } = useToast();
  const [brands, setBrands] = useState([]);
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [brandsRes, overviewRes] = await Promise.all([
        api.getBrands(),
        api.getBrandOverview(),
      ]);
      // Normalize to plain strings so a non-string payload (e.g. legacy
      // { id, name } records) can never crash rendering below
      // (brand.slice(0, 2) requires a string).
      const brandNames = (Array.isArray(brandsRes.data) ? brandsRes.data : [])
        .map((entry) => (typeof entry === "string" ? entry : entry?.name))
        .filter((name) => typeof name === "string" && name !== "");
      setBrands(brandNames);
      setOverview(overviewRes.data);
    } catch (err) {
      showToast('Load Failed', err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  useEffect(() => {
    const unsubscribe = subscribeRealtime('inventory:changed', () => {
      loadData();
    });

    return unsubscribe;
  }, [loadData]);

  return (
    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4" aria-label="Inventory Brand Overview">
      <div className="border-b border-slate-100 pb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Inventory Brand Overview</h2>
          <p className="text-xs text-slate-400">Live summary by brand — updates on every inventory change</p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse inventory brand overview' : 'Expand inventory brand overview'}
        >
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          <span className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>↓</span>
        </button>
      </div>
      <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${isExpanded ? 'max-h-[2400px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {loading && !overview.length ? (
          <p className="text-xs text-slate-400 italic py-2">Loading brand overview...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {brands.map((brand) => {
              const data = overview.find((b) => b.brand === brand) || {
                total_filled: 0,
                total_empty: 0,
                total_combined: 0,
              };
              return (
                <article key={brand} className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-white to-slate-50 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 text-xs font-black" aria-hidden="true">
                      {brand.slice(0, 2).toUpperCase()}
                    </span>
                    <h3 className="text-sm font-black text-slate-900">{brand}</h3>
                  </div>
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-semibold">Total Filled Tanks</dt>
                      <dd className="font-bold text-indigo-600">{data.total_filled}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-semibold">Total Empty Cylinders</dt>
                      <dd className="font-bold text-slate-600">{data.total_empty}</dd>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-2">
                      <dt className="text-slate-700 font-bold">Total Combined</dt>
                      <dd className="font-black text-slate-900">{data.total_combined}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
