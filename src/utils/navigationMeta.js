import { navigationItems } from "./navigationConfig";

const FALLBACK_SECTION_LABEL = "Other";
const DEFAULT_ACCESS_ID = "dashboard";

const buildNavigationMetaLookup = () => {
  const lookup = new Map();

  const registerPage = (pageId, sectionLabel, pageLabel, accessId) => {
    if (!pageId || lookup.has(pageId)) return;
    lookup.set(pageId, {
      pageId,
      sectionLabel: sectionLabel || FALLBACK_SECTION_LABEL,
      pageLabel: pageLabel || "Unknown Page",
      accessId: accessId || pageId,
    });
  };

  navigationItems.forEach((section) => {
    const sectionLabel = section?.label || FALLBACK_SECTION_LABEL;
    (section?.children || []).forEach((child) => {
      const pageLabel = child?.label || child?.path || child?.accessId;
      const accessId = child?.accessId || child?.path || child?.canonicalId;
      registerPage(child?.path, sectionLabel, pageLabel, accessId);
      registerPage(child?.canonicalId, sectionLabel, pageLabel, accessId);
      registerPage(child?.accessId, sectionLabel, pageLabel, accessId);
    });
  });

  return lookup;
};

const NAVIGATION_META_LOOKUP = buildNavigationMetaLookup();

const humanizePageId = (pageId) =>
  String(pageId || "")
    .split("/")
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .filter(Boolean)
        .map((word) =>
          word.length ? `${word[0].toUpperCase()}${word.slice(1)}` : "",
        )
        .join(" "),
    )
    .join(" / ") || "Unknown Page";

export const getNavigationMeta = (pageId) => {
  const normalizedPageId = String(pageId || "dashboard");
  const match = NAVIGATION_META_LOOKUP.get(normalizedPageId);
  if (match) return match;

  return {
    pageId: normalizedPageId,
    sectionLabel: FALLBACK_SECTION_LABEL,
    pageLabel: humanizePageId(normalizedPageId),
    accessId: normalizedPageId || DEFAULT_ACCESS_ID,
  };
};
