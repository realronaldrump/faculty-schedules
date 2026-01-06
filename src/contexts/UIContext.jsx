/**
 * UIContext - Centralized UI state management
 *
 * This context handles all UI-related state that was previously managed in App.jsx:
 * - Notifications/toasts
 * - Sidebar state (collapsed, mobile drawer)
 * - Pinned pages
 * - Modal states
 * - Command center (if used)
 *
 * Components consume this via the useUI() hook instead of prop drilling.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

const UIContext = createContext(null);

export const UIProvider = ({ children }) => {
  // Notification state
  const [notification, setNotification] = useState({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Command center state
  const [commandOpen, setCommandOpen] = useState(false);

  // Pinned pages state with localStorage persistence
  const [pinnedPages, setPinnedPages] = useState(() => {
    try {
      const savedPins = localStorage.getItem('pinnedPages');
      return savedPins ? JSON.parse(savedPins) : [];
    } catch (error) {
      console.error("Failed to parse pinned pages from localStorage", error);
      return [];
    }
  });

  // Logout confirmation modal
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Persist pinned pages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pinnedPages', JSON.stringify(pinnedPages));
    } catch (error) {
      console.error("Failed to save pinned pages to localStorage", error);
    }
  }, [pinnedPages]);

  // Notification functions
  const showNotification = useCallback((type, title, message) => {
    setNotification({
      show: true,
      type,
      title,
      message
    });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, show: false }));
  }, []);

  // Sidebar functions
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  // Pinned pages functions
  const togglePinPage = useCallback((pageId) => {
    setPinnedPages(prev =>
      prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId]
    );
  }, []);

  const isPinned = useCallback((pageId) => {
    return pinnedPages.includes(pageId);
  }, [pinnedPages]);

  // Command center functions
  const openCommandCenter = useCallback(() => {
    setCommandOpen(true);
  }, []);

  const closeCommandCenter = useCallback(() => {
    setCommandOpen(false);
  }, []);

  const toggleCommandCenter = useCallback(() => {
    setCommandOpen(prev => !prev);
  }, []);

  // Logout modal functions
  const openLogoutConfirm = useCallback(() => {
    setShowLogoutConfirm(true);
  }, []);

  const closeLogoutConfirm = useCallback(() => {
    setShowLogoutConfirm(false);
  }, []);

  // Context value
  const value = useMemo(() => ({
    // Notification
    notification,
    showNotification,
    hideNotification,

    // Sidebar
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    openMobileSidebar,
    closeMobileSidebar,

    // Pinned pages
    pinnedPages,
    togglePinPage,
    isPinned,

    // Command center
    commandOpen,
    setCommandOpen,
    openCommandCenter,
    closeCommandCenter,
    toggleCommandCenter,

    // Logout modal
    showLogoutConfirm,
    setShowLogoutConfirm,
    openLogoutConfirm,
    closeLogoutConfirm
  }), [
    notification,
    showNotification,
    hideNotification,
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    openMobileSidebar,
    closeMobileSidebar,
    pinnedPages,
    togglePinPage,
    isPinned,
    commandOpen,
    openCommandCenter,
    closeCommandCenter,
    toggleCommandCenter,
    showLogoutConfirm,
    openLogoutConfirm,
    closeLogoutConfirm
  ]);

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};

export default UIContext;
