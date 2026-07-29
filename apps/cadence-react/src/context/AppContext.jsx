import { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Active navigation stage
  const [activeStage, setActiveStage] = useState('demand-intake');

  // Globally selected demand (replaces sessionStorage selectedDemandId)
  const [selectedDemandId, setSelectedDemandId] = useState(
    () => sessionStorage.getItem('selectedDemandId') || null
  );

  // Shared demand list (fetched by DemandIntakePage, shared for nav/other modules)
  const [demands, setDemands] = useState([]);

  // Nav drawer open state
  const [navMenuOpen, setNavMenuOpen] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  const selectDemand = useCallback((id) => {
    setSelectedDemandId(id);
    if (id) {
      sessionStorage.setItem('selectedDemandId', id);
    } else {
      sessionStorage.removeItem('selectedDemandId');
    }
  }, []);

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <AppContext.Provider
      value={{
        activeStage,
        setActiveStage,
        selectedDemandId,
        selectDemand,
        demands,
        setDemands,
        navMenuOpen,
        setNavMenuOpen,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
