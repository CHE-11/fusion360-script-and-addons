import { useCallback, useState } from 'react';

import { IconTrash } from '@tabler/icons-react';

import type { ProProject } from '../../types/types';

type Props = {
  projects: ProProject[];
  currentProjectIndex: number;
  onSelectProject: (index: number) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (index: number) => void;
};

export function Projects({
  projects,
  currentProjectIndex,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: Props) {
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const doCreate = useCallback(() => {
    const name = newProjectName.trim();
    if (!name) return;
    onCreateProject(name);
    setShowNewProjectDialog(false);
    setNewProjectName('');
  }, [newProjectName, onCreateProject]);

  return (
    <>
      <div className="pp_topbar">
        <h2 className="pp_title">ProParams</h2>
        <button className="pp_btn pp_btnPrimary" onClick={() => setShowNewProjectDialog(true)}>
          New Project
        </button>
      </div>

      {showNewProjectDialog && (
        <div className="pp_card">
          <h3 className="pp_h3">New Project</h3>
          <input
            className="pp_input"
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project Name"
          />
          <div className="pp_rowRight">
            <button
              className="pp_btn"
              onClick={() => {
                setShowNewProjectDialog(false);
                setNewProjectName('');
              }}
            >
              Cancel
            </button>
            <button className="pp_btn pp_btnPrimary" onClick={doCreate}>
              Create
            </button>
          </div>
        </div>
      )}

      <div className="pp_projectList">
        {projects.map((p, i) => {
          const isSelected = i === currentProjectIndex;
          return (
            <div
              key={`${p.name}-${i}`}
              className={`pp_projectItem ${isSelected ? 'pp_projectItemSelected' : ''}`}
              onClick={() => onSelectProject(i)}
            >
              <span className="pp_projectName">{p.name}</span>
              <button
                className="pp_btn pp_btnDanger pp_btnIcon"
                title="Delete Project"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProject(i);
                }}
              >
                <IconTrash />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

