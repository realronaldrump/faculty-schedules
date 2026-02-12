const ImportPanel = ({ viewMode, renderImport }) => {
  if (viewMode !== "import") return null;
  return renderImport();
};

export default ImportPanel;
