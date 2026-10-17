/**
 * Count plus noun with the right plural: "1 contact", "3 contacts",
 * "1 person" / "2 people" (pass the irregular plural), "1,204 changes".
 */
export const pluralize = (count, singular, plural = `${singular}s`) => {
  const value = Number(count) || 0;
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
};
