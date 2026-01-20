export const formatElapsed = (elapsedMs = 0) => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "0s";
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export const calculateImportProgress = ({
  processedRows = 0,
  totalRows = 0,
  processedFiles = 0,
  totalFiles = 0,
}) => {
  const rowPercent =
    totalRows > 0 ? Math.min(100, (processedRows / totalRows) * 100) : null;
  const filePercent =
    totalFiles > 0 ? Math.min(100, (processedFiles / totalFiles) * 100) : null;
  const percent =
    rowPercent != null ? rowPercent : filePercent != null ? filePercent : null;
  return {
    percent,
    rowPercent,
    filePercent,
  };
};
