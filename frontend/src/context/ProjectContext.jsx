import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { demandService } from '../services/demandService';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [demands, setDemands] = useState([]);
  const [selectedDemandId, setSelectedDemandIdState] = useState(
    () => sessionStorage.getItem('selectedDemandId') || null
  );
  const [activeStage, setActiveStageState] = useState(
    () => sessionStorage.getItem('activeStage') || 'demand-intake'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDemands = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await demandService.getDemands();
      if (data) {
        setDemands(data);
      } else {
        setDemands([]);
      }
    } catch (e) {
      setError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectDemandId = useCallback((id) => {
    if (id) {
      sessionStorage.setItem('selectedDemandId', id);
    } else {
      sessionStorage.removeItem('selectedDemandId');
    }
    setSelectedDemandIdState(id);
  }, []);

  const setActiveStage = useCallback((stage) => {
    sessionStorage.setItem('activeStage', stage);
    setActiveStageState(stage);
  }, []);

  useEffect(() => {
    fetchDemands();
  }, [fetchDemands]);

  const selectedDemand = demands.find((d) => d.demand_id === selectedDemandId) || null;

  return (
    <ProjectContext.Provider
      value={{
        demands,
        selectedDemandId,
        selectedDemand,
        activeStage,
        loading,
        error,
        fetchDemands,
        selectDemandId,
        setActiveStage,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
