// Lightweight runtime page registry so admins can control visibility
// without code changes when new pages are added.

let registeredPageIds = new Set();

export function registerNavigationPages(navigationItems = []) {
  try {
    const collect = (items) => {
      items.forEach((item) => {
        const pageId = item.accessId || item.path;
        if (pageId) {
          registeredPageIds.add(pageId);
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

