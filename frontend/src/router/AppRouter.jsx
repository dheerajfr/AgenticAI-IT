import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../layouts/Layout';

// Page Imports
import Dashboard from '../pages/Dashboard';
import DemandIntake from '../pages/DemandIntake';
import EstimateShape from '../pages/EstimateShape';
import PlanSchedule from '../pages/PlanSchedule';
import Dependencies from '../pages/Dependencies';
import ConfigEnvironments from '../pages/ConfigEnvironments';
import BuildDeploy from '../pages/BuildDeploy';
import TestQuality from '../pages/TestQuality';
import ReleaseChange from '../pages/ReleaseChange';
import OpsReadiness from '../pages/OpsReadiness';
import EnvironmentState from '../pages/EnvironmentState';
import Exports from '../pages/Exports';

// Always On Sub-pages
import AlwaysOnLayout from '../layouts/AlwaysOnLayout';
import RiskIssues from '../pages/RiskIssues';
import BudgetCost from '../pages/BudgetCost';
import VendorCoordination from '../pages/VendorCoordination';
import ReportingCommunication from '../pages/ReportingCommunication';
import KnowledgeArtifacts from '../pages/KnowledgeArtifacts';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Index redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Core Stage modules */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/demand-intake" element={<DemandIntake />} />
          <Route path="/estimate-shape" element={<EstimateShape />} />
          <Route path="/plan-schedule" element={<PlanSchedule />} />
          <Route path="/dependencies" element={<Dependencies />} />
          <Route path="/config-environments" element={<ConfigEnvironments />} />
          <Route path="/build-deploy" element={<BuildDeploy />} />
          <Route path="/test-quality" element={<TestQuality />} />
          <Route path="/release-change" element={<ReleaseChange />} />
          <Route path="/ops-readiness" element={<OpsReadiness />} />

          {/* Infrastructure Health & Exports */}
          <Route path="/environment-state" element={<EnvironmentState />} />
          <Route path="/exports" element={<Exports />} />

          {/* Always On nested layouts */}
          <Route path="/always-on" element={<AlwaysOnLayout />}>
            <Route index element={<Navigate to="/always-on/risk-issues" replace />} />
            <Route path="risk-issues" element={<RiskIssues />} />
            <Route path="budget-cost" element={<BudgetCost />} />
            <Route path="vendor-coordination" element={<VendorCoordination />} />
            <Route path="reporting-communication" element={<ReportingCommunication />} />
            <Route path="knowledge-artifacts" element={<KnowledgeArtifacts />} />
          </Route>
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
