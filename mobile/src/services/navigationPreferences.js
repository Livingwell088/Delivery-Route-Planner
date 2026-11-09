// Apple navigation is retained in the builders but disabled in the current product.
export const navigationAppOptions = () => [{ value: 'google', label: 'Google Maps' }];
export const normalizeNavigationApp = (value) => navigationAppOptions().some((option) => option.value === value)
  ? value : 'google';

export function createNavigationPreference(storage, key, onChange, onSaveFailure = () => {}) {
  let revision = 0;
  let pending = Promise.resolve();
  return {
    async restore() {
      const started = revision;
      try {
        const value = await storage.getItem(key);
        if (started === revision) onChange(normalizeNavigationApp(value));
      } catch { /* Keep the current usable choice. */ }
    },
    select(value) {
      if (!navigationAppOptions().some((option) => option.value === value)) return Promise.resolve(false);
      const selected = ++revision;
      onChange(value);
      pending = pending.then(async () => {
        try { await storage.setItem(key, value); return true; }
        catch { if (selected === revision) onSaveFailure(); return false; }
      });
      return pending;
    },
  };
}
