// Positions use the card's measured dimensions. When a long form fills the
// viewport, compact instructions leave its inputs available; details can be
// opened explicitly and the controls remain reachable in a scrollable card.
export const calculateTutorialCardPosition = (target, size, viewport) => {
  const margin = 16;
  const gap = 12;
  const width = Math.min(size.width || 384, Math.max(0, viewport.width - margin * 2));
  const maxHeight = Math.max(0, viewport.height - margin * 2);
  const height = Math.min(size.height, maxHeight);
  const clampLeft = (left) => Math.max(margin, Math.min(left, viewport.width - width - margin));
  const centerLeft = clampLeft(target ? target.left + target.width / 2 - width / 2 : (viewport.width - width) / 2);

  if (!target) {
    return { position: "center", left: centerLeft, top: Math.max(margin, (viewport.height - height) / 2), maxHeight };
  }

  const candidates = [];
  const above = target.top - margin - gap;
  const below = viewport.height - margin - target.bottom - gap;
  const addVertical = (position, space) => {
    // Reserve room for the fixed header/footer and a usable scrolling body.
    if (space < 168) return;
    const cardHeight = Math.min(height, space);
    candidates.push({
      position,
      left: centerLeft,
      top: position === "top" ? target.top - gap - cardHeight : target.bottom + gap,
      maxHeight: Math.min(space, maxHeight),
      score: (space >= height ? 100000 : 0) + space,
    });
  };
  addVertical("top", above);
  addVertical("bottom", below);

  const verticalTop = Math.max(margin, Math.min(target.top + target.height / 2 - height / 2, viewport.height - margin - height));
  if (viewport.width - margin - target.right - gap >= width) {
    candidates.push({ position: "right", left: target.right + gap, top: verticalTop, maxHeight, score: 100000 + maxHeight });
  }
  if (target.left - margin - gap >= width) {
    candidates.push({ position: "left", left: target.left - gap - width, top: verticalTop, maxHeight, score: 100000 + maxHeight });
  }
  if (candidates.length) {
    const { score: _score, ...position } = candidates.sort((a, b) => b.score - a.score)[0];
    return position;
  }

  return { position: "docked", top: margin, left: centerLeft, maxHeight, compact: true };
};
