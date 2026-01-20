export const TEMPERATURE_DATA_REFRESH_EVENT = "temperature-data-refresh";

export const emitTemperatureDataRefresh = (detail = {}) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TEMPERATURE_DATA_REFRESH_EVENT, { detail }));
};

export const subscribeTemperatureDataRefresh = (handler) => {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler?.(event?.detail || {});
  window.addEventListener(TEMPERATURE_DATA_REFRESH_EVENT, listener);
  return () => window.removeEventListener(TEMPERATURE_DATA_REFRESH_EVENT, listener);
};
