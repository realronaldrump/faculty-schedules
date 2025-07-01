import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Menu, X } from 'lucide-react';

const Sidebar = ({ navigationItems, currentPage, onNavigate, collapsed, onToggleCollapse, selectedSemester }) => {
  const [expandedSections, setExpandedSections] = useState(['scheduling', 'analytics']); // Default expanded sections

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isActive = (path) => {
    if (path === 'dashboard') {
      return currentPage === 'dashboard';
    }
    return currentPage.startsWith(path) || currentPage === path;
  };

  const isCurrentPage = (path) => currentPage === path;

  return (
    <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} flex flex-col`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-baylor-green rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">HSD</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-baylor-green">HSD Dashboard</h1>
                <p className="text-xs text-gray-500">{selectedSemester || 'Fall 2025'}</p>
              </div>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {collapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedSections.includes(item.id);
            const itemIsActive = isActive(item.path || item.id);

            return (
              <div key={item.id}>
                {/* Main Navigation Item */}
                <button
                  onClick={() => {
                    if (hasChildren) {
                      if (!collapsed) {
                        toggleSection(item.id);
                      }
                    } else {
                      onNavigate(item.path || item.id);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-left rounded-lg transition-all duration-200 group ${
                    itemIsActive 
                      ? 'bg-baylor-green text-white shadow-sm' 
                      : 'text-gray-700 hover:bg-gray-100 hover:text-baylor-green'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon size={20} className={`flex-shrink-0 ${itemIsActive ? 'text-white' : 'text-gray-500 group-hover:text-baylor-green'}`} />
                    {!collapsed && (
                      <span className="font-medium">{item.label}</span>
                    )}
                  </div>
                  {!collapsed && hasChildren && (
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      <ChevronRight size={16} className={itemIsActive ? 'text-white' : 'text-gray-400'} />
                    </div>
                  )}
                </button>

                {/* Sub-navigation Items */}
                {!collapsed && hasChildren && isExpanded && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-100 pl-4">
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => onNavigate(child.path)}
                        className={`w-full flex items-center px-3 py-2 text-left text-sm rounded-lg transition-all duration-200 ${
                          isCurrentPage(child.path)
                            ? 'bg-baylor-gold/10 text-baylor-green font-medium border-l-2 border-baylor-gold -ml-6 pl-6'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-baylor-green'
                        }`}
                      >
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        {!collapsed && (
          <div className="text-center">
            <p className="text-xs text-gray-500">Baylor University</p>
            <p className="text-xs text-gray-400">Human Sciences & Design</p>
          </div>
        )}
      </div>

      {/* Collapsed state tooltip helper */}
      {collapsed && (
        <style jsx>{`
          .sidebar-item:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            background: black;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 1000;
            margin-left: 8px;
          }
        `}</style>
      )}
    </div>
  );
};

export default Sidebar;