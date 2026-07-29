import React from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { UIProvider } from './context/UIContext';
import AppRouter from './router/AppRouter';

export default function App() {
  return (
    <UIProvider>
      <ProjectProvider>
        <AppRouter />
      </ProjectProvider>
    </UIProvider>
  );
}
