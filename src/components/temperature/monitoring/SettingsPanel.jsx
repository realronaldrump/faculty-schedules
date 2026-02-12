const SettingsPanel = ({ viewMode, renderSettings }) => {
  if (viewMode !== "settings") return null;
  return renderSettings();
};

export default SettingsPanel;
