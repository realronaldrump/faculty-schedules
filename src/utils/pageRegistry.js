// Lightweight runtime page registry so admins can control visibility
// without code changes when new pages are added.

let registeredPageIds = new Set();

export function registerNavigationPages(navigationItems = []) {
  try {
    const collect = (items) => {
      items.forEach((item) => {
        if (item.path) {
          registeredPageIds.add(item.path);
        }
        if (Array.isArray(item.children)) {
          collect(item.children);
        }
      });
    };
    collect(navigationItems);
    // Ensure dashboard is always present
    registeredPageIds.add('dashboard');
  } catch (_) {
    // noop
  }
}

export function getAllRegisteredPageIds() {
  return Array.from(registeredPageIds);
}


