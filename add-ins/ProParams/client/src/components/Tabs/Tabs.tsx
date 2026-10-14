import type { ReactNode } from 'react';

import { IconBox, IconClick, IconWorld } from '@tabler/icons-react';

import type { TabId } from '../../types/types';

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

export function Tabs({ active, onChange }: Props) {
  return (
    <div id="pp_tabs" className="pp_tabs" role="tablist">
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
  );
}
