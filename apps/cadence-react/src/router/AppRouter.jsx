import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';

// Pages (lazy loaded for performance)
import { lazy, Suspense } from 'react';
import { SkeletonPage } from '../components/common/SkeletonLoader';

const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const DemandIntakePage = lazy(() => import('../pages/DemandIntakePage'));
const EstimateShapePage = lazy(() => import('../pages/EstimateShapePage'));
const PlanSchedulePage = lazy(() => import('../pages/PlanSchedulePage'));
const DependenciesPage = lazy(() => import('../pages/DependenciesPage'));
const ConfigEnvironmentsPage = lazy(() => import('../pages/ConfigEnvironmentsPage'));
const BuildDeployPage = lazy(() => import('../pages/BuildDeployPage'));
const TestQualityPage = lazy(() => import('../pages/TestQualityPage'));
const ReleaseChangePage = lazy(() => import('../pages/ReleaseChangePage'));
const OpsReadinessPage = lazy(() => import('../pages/OpsReadinessPage'));
const AlwaysOnPage = lazy(() => import('../pages/AlwaysOnPage'));
const EnvironmentStatePage = lazy(() => import('../pages/EnvironmentStatePage'));
const ExportsPage = lazy(() => import('../pages/ExportsPage'));

function PageSuspense({ children }) {
  return <Suspense fallback={<SkeletonPage />}>{children}</Suspense>;
}

export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          {/* Default redirect */}
          <Route index element={<Navigate to="/demand-intake" replace />} />

          {/* Dashboard */}
          <Route path="dashboard" element={<PageSuspense><DashboardPage /></PageSuspense>} />

          {/* Core Lifecycle Stages */}
          <Route path="demand-intake" element={<PageSuspense><DemandIntakePage /></PageSuspense>} />
          <Route path="estimate-shape" element={<PageSuspense><EstimateShapePage /></PageSuspense>} />
          <Route path="plan-schedule" element={<PageSuspense><PlanSchedulePage /></PageSuspense>} />
          <Route path="dependencies" element={<PageSuspense><DependenciesPage /></PageSuspense>} />
          <Route path="config-environments" element={<PageSuspense><ConfigEnvironmentsPage /></PageSuspense>} />
          <Route path="build-deploy" element={<PageSuspense><BuildDeployPage /></PageSuspense>} />
          <Route path="test-quality" element={<PageSuspense><TestQualityPage /></PageSuspense>} />
          <Route path="release-change" element={<PageSuspense><ReleaseChangePage /></PageSuspense>} />
          <Route path="ops-readiness" element={<PageSuspense><OpsReadinessPage /></PageSuspense>} />

          {/* Always On — redirect base to first tab */}
          <Route path="always-on" element={<Navigate to="/risk-issues" replace />} />

          {/* Always On sub-modules */}
          <Route path="risk-issues" element={<PageSuspense><AlwaysOnPage activeTab="risk-issues" /></PageSuspense>} />
          <Route path="budget-cost" element={<PageSuspense><AlwaysOnPage activeTab="budget-cost" /></PageSuspense>} />
          <Route path="vendor-coordination" element={<PageSuspense><AlwaysOnPage activeTab="vendor-coordination" /></PageSuspense>} />
          <Route path="reporting-communication" element={<PageSuspense><AlwaysOnPage activeTab="reporting-communication" /></PageSuspense>} />
          <Route path="knowledge-artifacts" element={<PageSuspense><AlwaysOnPage activeTab="knowledge-artifacts" /></PageSuspense>} />

          {/* Misc */}
          <Route path="environment-state" element={<PageSuspense><EnvironmentStatePage /></PageSuspense>} />
          <Route path="exports" element={<PageSuspense><ExportsPage /></PageSuspense>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/demand-intake" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
