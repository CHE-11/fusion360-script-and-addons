import type { TabId } from '../../types/types';

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'sketches', label: 'Sketches' },
  { id: 'joints', label: 'Joints' },
];

export function Tabs({ active, onChange }: Props) {
  return (
    <div id="cs_tabs" className="cs_tabs" role="tablist">
      {TABS.map((tab) => {
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
