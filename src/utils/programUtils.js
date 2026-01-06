export const normalizeProgramName = (name) => {
  if (typeof name !== 'string') return '';
  return name.replace(/\s+/g, ' ').trim();
};

export const getProgramNameKey = (name) =>
  normalizeProgramName(name).toLowerCase();

export const isReservedProgramName = (name) =>
  getProgramNameKey(name) === 'unassigned';
