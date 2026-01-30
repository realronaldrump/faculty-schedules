import React, { useState, useMemo } from "react";
import { Building, X, Search, Plus } from "lucide-react";

/**
 * BuildingSelector - Tag-based building selection with search
 *
 * Replaces checkbox lists with a more compact, searchable tag interface
 */

const BuildingSelector = ({
  availableBuildings = [],
  selectedBuildings = [],
  onChange,
  placeholder = "Search buildings...",
  allowCustomBuildings = true,
  maxBuildings = 10,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Filter buildings based on search
  const filteredBuildings = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return availableBuildings.filter(
      (b) => b.toLowerCase().includes(term) && !selectedBuildings.includes(b),
    );
  }, [availableBuildings, selectedBuildings, searchTerm]);

  // Check if search term is a custom building not in list
  const canAddCustom = useMemo(() => {
    return (
      allowCustomBuildings &&
      searchTerm &&
      !availableBuildings.includes(searchTerm) &&
      !selectedBuildings.includes(searchTerm) &&
      selectedBuildings.length < maxBuildings
    );
  }, [
    allowCustomBuildings,
    searchTerm,
    availableBuildings,
    selectedBuildings,
    maxBuildings,
  ]);

  const toggleBuilding = (building) => {
    if (selectedBuildings.includes(building)) {
      onChange(selectedBuildings.filter((b) => b !== building));
    } else if (selectedBuildings.length < maxBuildings) {
      onChange([...selectedBuildings, building]);
      setSearchTerm("");
    }
  };

  const addCustomBuilding = () => {
    if (canAddCustom) {
      onChange([...selectedBuildings, searchTerm.trim()]);
      setSearchTerm("");
      setIsDropdownOpen(false);
    }
  };

  const removeBuilding = (building) => {
    onChange(selectedBuildings.filter((b) => b !== building));
  };

  return (
    <div className="space-y-2">
      {/* Selected Buildings Tags */}
      {selectedBuildings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedBuildings.map((building, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-baylor-green text-white text-sm rounded-full"
            >
              <Building size={14} />
              {building}
              <button
                onClick={() => removeBuilding(building)}
                className="ml-1 p-0.5 hover:bg-white/20 rounded-full transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={placeholder}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green text-sm"
              disabled={selectedBuildings.length >= maxBuildings}
            />
          </div>
          {selectedBuildings.length >= maxBuildings && (
            <span className="text-xs text-amber-600 whitespace-nowrap">
              Max {maxBuildings} buildings
            </span>
          )}
        </div>

        {/* Dropdown */}
        {isDropdownOpen && (filteredBuildings.length > 0 || canAddCustom) && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsDropdownOpen(false)}
            />
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredBuildings.map((building, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    toggleBuilding(building);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-baylor-green/10 text-left text-sm transition-colors"
                >
                  <Building size={14} className="text-gray-400" />
                  {building}
                </button>
              ))}

              {canAddCustom && (
                <button
                  onClick={addCustomBuilding}
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-baylor-green/10 text-left text-sm text-baylor-green border-t border-gray-100 transition-colors"
                >
                  <Plus size={14} />
                  Add "{searchTerm}"
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Hint */}
      {availableBuildings.length > 0 && (
        <p className="text-xs text-gray-500">
          {selectedBuildings.length === 0
            ? `Type to search from ${availableBuildings.length} buildings`
            : `${selectedBuildings.length} of ${maxBuildings} buildings selected`}
        </p>
      )}
    </div>
  );
};

export default BuildingSelector;
