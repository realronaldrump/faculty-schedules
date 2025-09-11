// Lightweight global action registry
// Components/features can register action keys at runtime.
// Admin UI can read these to show a complete list without manual maintenance.

let actionKeys = new Set();

export function registerActionKey(key) {
  try {
    if (typeof key === 'string' && key.trim()) {
      actionKeys.add(key.trim());
    }
  } catch (_) {}
}

export function registerActionKeys(keys) {
  try {
    if (Array.isArray(keys)) keys.forEach(registerActionKey);
  } catch (_) {}
}

export function getAllRegisteredActionKeys() {
  return Array.from(actionKeys);
}


