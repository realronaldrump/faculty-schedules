import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Menu, X, Home, Calendar, Users, BarChart3, Settings, Bell, Search, User, Database, Shield, Star } from 'lucide-react';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'individual-availability', label: 'Individual Availability', icon: User },
  { id: 'room-schedules', label: 'Room Schedules', icon: Calendar },
  { id: 'faculty-schedules', label: 'Faculty Schedules', icon: Calendar },
  { id: 'faculty-directory', label: 'Faculty Directory', icon: Users },
  { id: 'staff-directory', label: 'Staff Directory', icon: Users },
  { id: 'adjunct-directory', label: 'Adjunct Directory', icon: Users },
  { id: 'program-management', label: 'Program Management', icon: BarChart3 },
  { id: 'department-insights', label: 'Department Insights', icon: BarChart3 },
  { id: 'course-management', label: 'Course Management', icon: BarChart3 },
  { id: 'email-lists', label: 'Email Lists', icon: Users },
  { id: 'building-directory', label: 'Office Directory', icon: Users },
  { id: 'smart-data-import', label: 'Smart Data Import', icon: Database },
  { id: 'data-hygiene', label: 'Data Hygiene', icon: Shield },
  { id: 'systems', label: 'Systems', icon: Settings },
];

const Sidebar = ({ navigationItems, currentPage, onNavigate, collapsed, onToggleCollapse, selectedSemester, pinnedPages, togglePinPage }) => {
  const [expandedSections, setExpandedSections] = useState([]); // Default expanded sections

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const findNavItem = (id) => {
    for (const section of navigationItems) {
      if (section.id === id) return section;
      if (section.children) {
        const child = section.children.find(c => c.id === id);
        if (child) return child;
      }
    }
    return null;
  };

  const isActive = (path) => {
    if (path === 'dashboard') {
      return currentPage === 'dashboard';
    }
    return currentPage.startsWith(path) || currentPage === path;
  };

  const isCurrentPage = (path) => currentPage === path;

  return (
    <div className={`sidebar transition-all duration-300 ${collapsed ? 'w-16' : 'w-72'} flex flex-col min-h-screen h-screen sticky top-0`}>
      {/* Professional University Header */}
      <div className={`sidebar-header ${collapsed ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="sidebar-brand">
              <div className="sidebar-logo">
                <span className="text-white font-bold text-sm font-['DM_Sans']">HSD</span>
              </div>
              <div>
                <div className="sidebar-title text-lg font-bold text-white font-['DM_Sans']">HSD Dashboard</div>
                <div className="sidebar-subtitle text-sm text-baylor-gold/80 mt-1 font-['DM_Sans']">
                  {selectedSemester || 'Fall 2025'}
                </div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="sidebar-logo mx-auto">
              <span className="text-white font-bold text-sm font-['DM_Sans']">HSD</span>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>
      </div>

      {/* Professional Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 baylor-scrollbar">
        <div className="space-y-1 px-4">
          {/* Pinned Items */}
          {!collapsed && pinnedPages.length > 0 && (
            <div className="space-y-1 mb-4">
              <div className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pinned</div>
              {pinnedPages.map(pageId => {
                const item = findNavItem(pageId);
                if (!item) return null;
                const Icon = item.icon || User;
                return (
                  <button
                    key={`pinned-${item.id}`}
                    onClick={() => onNavigate(item.path)}
                    className={`nav-sub-item w-full ${isCurrentPage(item.path) ? 'nav-sub-item-active' : 'nav-sub-item-inactive'}`}
                  >
                    <Icon size={16} className="mr-2" />
                    <span className="text-sm font-['DM_Sans']">{item.label}</span>
                  </button>
                );
              })}
              <div className="pt-2 border-b border-gray-200 mx-2"></div>
            </div>
          )}

          {navigationItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedSections.includes(item.id);
            const itemIsActive = isActive(item.path || item.id);

            return (
              <div key={item.id} className="space-y-1">
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
                  className={`nav-item w-full ${
                    itemIsActive ? 'nav-item-active' : 'nav-item-inactive'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <Icon 
                      size={20} 
                      className={`flex-shrink-0 ${
                        itemIsActive ? 'text-white' : 'text-gray-500 group-hover:text-baylor-green'
                      }`} 
                    />
                    {!collapsed && (
                      <span className="font-medium text-sm font-['DM_Sans']">{item.label}</span>
                    )}
                  </div>
                  {!collapsed && hasChildren && (
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      <ChevronRight 
                        size={16} 
                        className={itemIsActive ? 'text-white' : 'text-gray-400'} 
                      />
                    </div>
                  )}
                </button>

                {/* Sub-navigation Items */}
                {!collapsed && hasChildren && isExpanded && (
                  <div className="space-y-1 pl-2">
                    {item.children.map((child) => {
                      const isPinned = pinnedPages.includes(child.id);
                      return (
                        <div key={child.id} className="group flex items-center">
                          <button
                            onClick={() => onNavigate(child.path)}
                            className={`nav-sub-item w-full text-left ${
                              isCurrentPage(child.path) ? 'nav-sub-item-active' : 'nav-sub-item-inactive'
                            }`}
                          >
                            <span className="text-sm font-['DM_Sans']">{child.label}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePinPage(child.id);
                            }}
                            className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-baylor-green/20"
                            title={isPinned ? 'Unpin page' : 'Pin page'}
                          >
                            <Star 
                              size={14} 
                              className={`${isPinned ? 'text-baylor-gold fill-current' : 'text-gray-400'}`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Professional Footer */}
      <div className="border-t border-gray-200 p-4 mt-auto">
        {!collapsed ? (
          <div className="text-center space-y-1">
            <div className="text-xs font-medium text-baylor-green font-['DM_Sans']">Baylor University</div>
            <div className="text-xs text-gray-500 font-['DM_Sans']">Human Sciences & Design</div>
            <div className="text-xs text-gray-400 mt-2 font-['DM_Sans']">
              Faculty Schedule Management System
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-8 h-8 bg-baylor-green/10 rounded-lg flex items-center justify-center">
              <span className="text-xs font-bold text-baylor-green font-['DM_Sans']">BU</span>
            </div>
          </div>
        )}
      </div>

      {/* Tooltip styles for collapsed state */}
      {collapsed && (
        <style jsx>{`
          .nav-item:hover::after {
            content: attr(title);
            position: absolute;
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(21, 71, 52, 0.95);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            z-index: 1000;
            margin-left: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            font-family: 'DM Sans', sans-serif;
          }
          .nav-item:hover::before {
            content: '';
            position: absolute;
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            margin-left: 6px;
            border: 6px solid transparent;
            border-right-color: rgba(21, 71, 52, 0.95);
            z-index: 1000;
          }
        `}</style>
      )}
    </div>
  );
};

export default Sidebar;