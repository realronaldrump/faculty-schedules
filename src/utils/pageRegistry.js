// Lightweight runtime page registry so admins can control visibility
// without code changes when new pages are added.

let registeredPageIds = new Set();
let registeredPageMeta = new Map();
let registeredNavigationEntries = [];

const DEFAULT_SECTION = "Other";

export function registerNavigationPages(navigationItems = []) {
  try {
    registeredPageIds = new Set();
    registeredPageMeta = new Map();
    registeredNavigationEntries = [];

    const registerEntry = (item, sectionLabel, sectionOrder, order) => {
      const pageId = item?.accessId || item?.path;
      if (!pageId) return;
      const label = item?.label || pageId;
      const section = sectionLabel || DEFAULT_SECTION;
      const entry = {
        id: pageId,
        label,
        section,
        sectionOrder: Number.isInteger(sectionOrder) ? sectionOrder : 999,
        order: Number.isInteger(order) ? order : 999,
        sourceId: item?.id || item?.path || item?.label || pageId,
        path: item?.path,
        accessId: item?.accessId,
      };

      registeredNavigationEntries.push(entry);
      registeredPageIds.add(pageId);

      const existing = registeredPageMeta.get(pageId);
      if (!existing) {
        registeredPageMeta.set(pageId, { ...entry, aliases: [] });
      } else {
        const aliases = existing.aliases || [];
        const alreadyAdded = aliases.some(
          (alias) => alias.label === label && alias.section === section,
        );
        if (!alreadyAdded) {
          aliases.push({
            label,
            section,
            sectionOrder: entry.sectionOrder,
            order: entry.order,
            sourceId: entry.sourceId,
            path: entry.path,
            accessId: entry.accessId,
          });
          existing.aliases = aliases;
        }
      }
    };

    const collect = (items, sectionLabel = null, sectionOrder = null) => {
      items.forEach((item, index) => {
        const hasChildren =
          Array.isArray(item.children) && item.children.length > 0;
        if (hasChildren) {
          const nextSectionLabel = item.label || sectionLabel || DEFAULT_SECTION;
          const nextSectionOrder =
            sectionOrder === null || sectionOrder === undefined
              ? index
              : sectionOrder;
          if (item.path || item.accessId) {
            registerEntry(item, nextSectionLabel, nextSectionOrder, index);
          }
          collect(item.children, nextSectionLabel, nextSectionOrder);
          return;
        }

        registerEntry(
          item,
          sectionLabel || item.label || DEFAULT_SECTION,
          sectionOrder === null || sectionOrder === undefined
            ? index
            : sectionOrder,
          index,
        );
      });
    };

    collect(navigationItems);

    // Ensure dashboard is always present
    if (!registeredPageIds.has("dashboard")) {
      const fallbackEntry = {
        id: "dashboard",
        label: "Dashboard",
        section: "Home",
        sectionOrder: 0,
        order: 0,
        sourceId: "dashboard",
        path: "dashboard",
        accessId: undefined,
      };
      registeredPageIds.add("dashboard");
      registeredNavigationEntries.push(fallbackEntry);
      registeredPageMeta.set("dashboard", { ...fallbackEntry, aliases: [] });
    }
  } catch (_) {
    // noop
  }
}

export function getAllRegisteredPageIds() {
  return Array.from(registeredPageIds);
}

export function getRegisteredPageMeta() {
  return Array.from(registeredPageMeta.values());
}

export function getRegisteredNavigationEntries() {
  return registeredNavigationEntries.slice();
}
