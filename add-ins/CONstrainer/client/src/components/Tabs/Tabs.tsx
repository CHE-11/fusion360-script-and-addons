import type { TabId } from '../../types/types';

type Props = {
  active: TabId;
  showJoints: boolean;
  onChange: (tab: TabId) => void;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'sketches', label: 'Sketches' },
  { id: 'joints', label: 'Joints' },
];

export function Tabs({ active, showJoints, onChange }: Props) {
  const tabs = TABS.filter((tab) => tab.id !== 'joints' || showJoints);
  return (
    <div id="cs_tabs" className="cs_tabs" role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`cs_tab_${tab.id}`}
            className={selected ? 'cs_tab cs_tabActive' : 'cs_tab'}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
