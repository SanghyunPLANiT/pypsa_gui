import React from 'react';
import { RunHistoryEntry } from '../../shared/types';
import { RunHistoryCard } from './RunHistoryCard';

interface RunHistoryListProps {
  runHistory: RunHistoryEntry[];
  onRestoreRun: (entry: RunHistoryEntry) => void;
  onRenameHistoryEntry: (id: string, label: string) => void;
  onPinHistoryEntry: (id: string, pinned: boolean) => void;
  onDeleteHistoryEntry: (id: string) => void;
}

export function RunHistoryList({
  runHistory,
  onRestoreRun,
  onRenameHistoryEntry,
  onPinHistoryEntry,
  onDeleteHistoryEntry,
}: RunHistoryListProps) {
  return (
    <div className="hist-list">
      {runHistory.map((entry) => (
        <RunHistoryCard
          key={entry.id}
          entry={entry}
          onView={() => onRestoreRun(entry)}
          onRename={(label) => onRenameHistoryEntry(entry.id, label)}
          onPin={(pinned) => onPinHistoryEntry(entry.id, pinned)}
          onDelete={() => onDeleteHistoryEntry(entry.id)}
        />
      ))}
    </div>
  );
}
