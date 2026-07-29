import React from 'react';
import StatusPill from '../common/StatusPill';

const stagesConfig = [
  { id: 'demand-intake', label: 'Demand & intake', status: 'live' },
  { id: 'estimate-shape', label: 'Estimate & shape', status: 'live' },
  { id: 'plan-schedule', label: 'Plan & schedule', status: 'live' },
  { id: 'config-environments', label: 'Config & environments', status: 'live' },
  { id: 'dependencies', label: 'Dependencies', status: 'live' },
  { id: 'build-deploy', label: 'Build & Deploy', status: 'live' },
  { id: 'test-quality', label: 'Test & Quality', status: 'live' },
  { id: 'release-change', label: 'Release & Change', status: 'live' },
  { id: 'ops-readiness', label: 'Ops readiness', status: 'live' },
  { id: 'budget-cost', label: 'Budget & cost', status: 'live' },
  { id: 'risk-issues', label: 'Risk & issues', status: 'live' },
  { id: 'vendor-coordination', label: 'Vendor coordination', status: 'live' },
  { id: 'knowledge-artifacts', label: 'Knowledge artifacts', status: 'live' },
  { id: 'reporting-communication', label: 'Reporting & comms', status: 'live' },
  { id: 'environment-state', label: 'Environment state', status: 'live' },
  { id: 'exports', label: 'Data exports', status: 'live' }
];

export default function StageRail({ activeStage, onStageChange }) {
  return (
    <>
      <style>{`
        .stage-rail-host {
          display: block;
          width: 100%;
          background-color: var(--bg-secondary, #161f30);
          border-bottom: 1px solid var(--border-color, #2e3c54);
          padding: 0;
          box-shadow: var(--shadow-sm);
        }
        .rail-container {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .rail-container::-webkit-scrollbar {
          display: none;
        }
        .stage-node {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1rem 0.5rem;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          user-select: none;
          text-align: center;
          position: relative;
          min-width: 120px;
          transition: all 0.2s ease;
        }
        .stage-node::after {
          content: '';
          position: absolute;
          right: 0;
          top: 30%;
          bottom: 30%;
          width: 1px;
          background-color: var(--border-color, #2e3c54);
        }
        .stage-node:last-child::after {
          display: none;
        }
        .stage-node:hover {
          background-color: rgba(255, 255, 255, 0.02);
        }
        .stage-node.active {
          border-bottom-color: var(--color-brand, #6366f1);
          background-color: rgba(99, 102, 241, 0.04);
        }
        .stage-title {
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 0.8rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: var(--text-secondary, #94a3b8);
        }
        .stage-node.active .stage-title {
          color: var(--text-primary, #f8fafc);
        }
        .stage-node:hover .stage-title {
          color: var(--text-primary, #f8fafc);
        }
        .status-pill-wrapper {
          margin-top: 0.15rem;
        }
      `}</style>
      <div className="stage-rail-host">
        <div className="rail-container">
          {stagesConfig.map((stage) => {
            const isActive = stage.id === activeStage;
            return (
              <div
                key={stage.id}
                className={`stage-node ${isActive ? 'active' : ''}`}
                onClick={() => onStageChange && onStageChange(stage.id)}
              >
                <div className="stage-title">{stage.label}</div>
                <div className="status-pill-wrapper">
                  <StatusPill status={stage.status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
