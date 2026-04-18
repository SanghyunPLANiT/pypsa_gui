import React from 'react';
import { RunHistoryEntry, RunResults } from '../../shared/types';
import { RunComparisonTable } from '../run-history/RunComparisonTable';

interface Props {
  runHistory: RunHistoryEntry[];
  activeResults: RunResults | null;
}

export function ComparisonPane({ runHistory, activeResults }: Props) {
  if (runHistory.length < 2) {
    return (
      <div className="analytics-empty">
        <h3>No runs to compare yet</h3>
        <p>
          Run the model at least twice — with different settings, carbon prices, or constraints —
          and the comparison table will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="results-dashboard">
      <RunComparisonTable
        runHistory={runHistory}
        activeResults={activeResults ?? runHistory[0].results}
      />
    </div>
  );
}
