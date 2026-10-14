import { useCallback, useMemo, useState } from 'react';

import { IconEdit, IconTrash } from '@tabler/icons-react';

import type { ProParam, ProProject } from '../../types/types';
import { sanitizeName } from '../../utils/sanitizeName';

type Props = {
  projects: ProProject[];
  currentProjectIndex: number;
  selectedProject: ProProject;
  onProjectsChange: (nextProjects: ProProject[]) => void;
  onSyncProject: (project: ProProject) => void;
};

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      const cleaned_text = text.replace(/{{/g, '').replace(/}}/g, '');
      await navigator.clipboard.writeText(cleaned_text);
      return true;
    }
  } catch {
    // fall through to legacy copy
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ParametersTable({
  projects,
  currentProjectIndex,
  selectedProject,
  onProjectsChange,
  onSyncProject,
}: Props) {
  const [editingParamIndex, setEditingParamIndex] = useState<number>(-1);

  const [showParamDialog, setShowParamDialog] = useState(false);
  const [pName, setPName] = useState('');
  const [pValue, setPValue] = useState('');
  const [pUnit, setPUnit] = useState('');
  const [pComment, setPComment] = useState('');

  const closeParamDialog = useCallback(() => {
    setShowParamDialog(false);
    setEditingParamIndex(-1);
    setPName('');
    setPValue('');
    setPUnit('');
    setPComment('');
  }, []);

  const openAddParam = useCallback(() => {
    setEditingParamIndex(-1);
    setPName('');
    setPValue('');
    setPUnit('');
    setPComment('');
    setShowParamDialog(true);
  }, []);

  const openEditParam = useCallback(
    (idx: number) => {
      const p = selectedProject.params[idx];
      setEditingParamIndex(idx);
      setPName(p.name);
      setPValue(p.value);
      setPUnit(p.unit || '');
      setPComment(p.comment || '');
      setShowParamDialog(true);
    },
    [selectedProject.params]
  );

  const onSaveParam = useCallback(() => {
    const name = pName.trim();
    const value = pValue.trim();
    const unit = pUnit.trim();
    const comment = pComment.trim();

    if (!name || !value) {
      window.alert('Name and Value are required');
      return;
    }

    const existingIndex = selectedProject.params.findIndex((p) => p.name === name);
    if (existingIndex !== -1 && existingIndex !== editingParamIndex) {
      window.alert('Param name must be unique in project');
      return;
    }

    const nextProjects = projects.slice();
    const nextProj: ProProject = {
      ...selectedProject,
      params: selectedProject.params.slice(),
    };

    const nextParam: ProParam = { name, value, unit, comment };
    if (editingParamIndex > -1) {
      nextProj.params[editingParamIndex] = nextParam;
    } else {
      nextProj.params.push(nextParam);
    }

    nextProjects[currentProjectIndex] = nextProj;
    onProjectsChange(nextProjects);
    closeParamDialog();
  }, [
    pName,
    pValue,
    pUnit,
    pComment,
    selectedProject,
    editingParamIndex,
    projects,
    currentProjectIndex,
    onProjectsChange,
    closeParamDialog,
  ]);

  const onDeleteParam = useCallback(
    (idx: number) => {
      if (!window.confirm('Delete param?')) return;

      const nextProjects = projects.slice();
      const nextProj: ProProject = {
        ...selectedProject,
        params: selectedProject.params.slice(),
      };
      nextProj.params.splice(idx, 1);
      nextProjects[currentProjectIndex] = nextProj;
      onProjectsChange(nextProjects);
    },
    [projects, selectedProject, currentProjectIndex, onProjectsChange]
  );

  const syncToFusion = useCallback(() => onSyncProject(selectedProject), [onSyncProject, selectedProject]);

  const refNames = useMemo(() => {
    const sProj = sanitizeName(selectedProject.name);
    return selectedProject.params.map((p) => {
      const sParam = sanitizeName(p.name);
      return `{{${sProj}_${sParam}}}`;
    });
  }, [selectedProject.name, selectedProject.params]);

  return (
    <div id="paramArea">
      <hr className="pp_hr" />

      <div className="pp_paramsHeader">
        <h3 className="pp_h3 pp_h3NoMargin">Parameters</h3>
        <div className="pp_controls">
          <button className="pp_btn" onClick={openAddParam}>
            Add Param
          </button>
          <button className="pp_btn pp_btnPrimary" onClick={syncToFusion}>
            Sync to Fusion
          </button>
        </div>
      </div>

      {showParamDialog && (
        <div className="pp_card pp_cardTight">
          <input
            className="pp_input"
            type="text"
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="pp_input"
            type="text"
            value={pValue}
            onChange={(e) => setPValue(e.target.value)}
            placeholder="Value (e.g. 10mm)"
          />
          <input
            className="pp_input"
            type="text"
            value={pUnit}
            onChange={(e) => setPUnit(e.target.value)}
            placeholder="Unit (optional)"
          />
          <input
            className="pp_input"
            type="text"
            value={pComment}
            onChange={(e) => setPComment(e.target.value)}
            placeholder="Comment"
          />
          <div className="pp_rowRight">
            <button className="pp_btn" onClick={closeParamDialog}>
              Cancel
            </button>
            <button className="pp_btn pp_btnPrimary" onClick={onSaveParam}>
              {editingParamIndex > -1 ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      <table className="pp_table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Ref Name</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {selectedProject.params.map((p, i) => {
            const refName = refNames[i] || '';
            return (
              <tr key={`${p.name}-${i}`}>
                <td>{p.name}</td>
                <td>{p.value}</td>
                <td>{p.unit || ''}</td>
                <td>
                  <code
                    className="pp_ref"
                    title="Click to copy"
                    onClick={() => {
                      void copyToClipboard(refName);
                    }}
                  >
                    {refName}
                  </code>
                </td>
                <td>
                  <div className="pp_actions">
                    <button className="pp_btn pp_btnIcon" title="Edit" onClick={() => openEditParam(i)}>
                      <IconEdit />
                    </button>
                    <button
                      className="pp_btn pp_btnDanger pp_btnIcon"
                      title="Delete"
                      onClick={() => onDeleteParam(i)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

