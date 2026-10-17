/**
 * keyDown handler that lets Enter or Space activate a clickable element that
 * isn't a button (table rows, schedule blocks). Keys pressed on controls
 * inside the element are left alone.
 */
export const onActivateKey = (handler) => (event) => {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handler(event);
  }
};
