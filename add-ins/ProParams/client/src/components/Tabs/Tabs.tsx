import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { IconArrowsTransferUpDown, IconBox, IconClick, IconWorld } from '@tabler/icons-react';

import { request } from '../../connector/fusionBridge';
import type { GlobalParam, PushResult, TabId } from '../../types/types';
import { getLastSyncAt, subscribeLastSync } from '../../utils/lastSync';
import { useToast } from '../common/Toast';

type TabDef = {
  id: TabId;
  label: string;
  icon: ReactNode;
  hint: string;
};

const TABS: TabDef[] = [
  { id: 'global', label: 'Global', icon: <IconWorld size={16} />, hint: 'App-wide saved parameters' },
  { id: 'project', label: 'Project', icon: <IconBox size={16} />, hint: 'Parameters in the active design' },
  { id: 'feature', label: 'Feature', icon: <IconClick size={16} />, hint: 'Parameters on the selected entity' },
];

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
};

function formatSyncTime(at: number): string {
  const date = new Date(at);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day}, ${time}`;
}

export function Tabs({ active, onChange }: Props) {
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(getLastSyncAt());
  const [params, setParams] = useState<GlobalParam[]>([]);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  
  const pushToDesign = useCallback(async () => {
    setBusy(true);
    try {
      const result = await request<PushResult>('global:pushToDesign', {});
      const { created, updated, errors } = result;
      if (errors.length) {
        showToast(`Pushed with ${errors.length} error(s): ${errors[0]}`, 'error');
      } else {
        showToast(`Pushed to design (${created} created, ${updated} updated).`, 'success');
      }
    } catch (e) {
      showToast(`Push failed: ${String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [showToast]);
  
  useEffect(() => subscribeLastSync(setLastSyncAt), []);

  const syncLabel = lastSyncAt == null ? '—' : formatSyncTime(lastSyncAt);
  const syncTitle =
    lastSyncAt == null
      ? 'Not synced yet'
      : `Last sync ${new Date(lastSyncAt).toLocaleString()}`;

  return (
    <div id="pp_tabs" className="pp_tabs">
      <div id="pp_tabList" className="pp_tabList" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`pp_tab_${tab.id}`}
            className={`pp_tab ${active === tab.id ? 'pp_tabActive' : ''}`}
            role="tab"
            aria-selected={active === tab.id}
            title={tab.hint}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <span id="pp_lastSync" className="pp_lastSync" title={syncTitle}>
        Last sync {syncLabel}
      </span>
      <button
        id="pp_global_pushBtn"
        className="pp_btn"
        title="Create/update these parameters in the active design"
        onClick={() => void pushToDesign()}
        disabled={busy || params.length === 0}
      >
        <IconArrowsTransferUpDown size={14} />
      </button>
    </div>
  );
}
