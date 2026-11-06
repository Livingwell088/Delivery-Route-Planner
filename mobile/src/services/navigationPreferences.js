export const navigationAppOptions = (platform) => platform?.OS === 'ios'
  ? [{ value: 'google', label: 'Google Maps' }, { value: 'apple', label: 'Apple Maps' }]
  : [{ value: 'google', label: 'Google Maps' }];

export function createNavigationPreference(storage, key, onChange, onSaveFailure = () => {}) {
  let revision = 0;
  let pending = Promise.resolve();
  return {
    async restore() {
      const started = revision;
      try {
        const value = await storage.getItem(key);
        if (started === revision) onChange(value === 'apple' || value === 'google' ? value : 'google');
      } catch { /* Keep the current usable choice. */ }
    },
    select(value) {
      if (value !== 'google' && value !== 'apple') return Promise.resolve(false);
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
