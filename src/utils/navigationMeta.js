import { navigationItems } from "./navigationConfig";

const FALLBACK_SECTION_LABEL = "Other";

const buildNavigationMetaLookup = () => {
  const lookup = new Map();

  const registerPage = (pageId, sectionLabel, pageLabel) => {
    if (!pageId || lookup.has(pageId)) return;
    lookup.set(pageId, {
      pageId,
      sectionLabel: sectionLabel || FALLBACK_SECTION_LABEL,
      pageLabel: pageLabel || "Unknown Page",
    });
  };

  navigationItems.forEach((section) => {
    const sectionLabel = section?.label || FALLBACK_SECTION_LABEL;
    (section?.children || []).forEach((child) => {
      const pageLabel = child?.label || child?.path;
      registerPage(child?.path, sectionLabel, pageLabel);
      registerPage(child?.canonicalId, sectionLabel, pageLabel);
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
  };
};
