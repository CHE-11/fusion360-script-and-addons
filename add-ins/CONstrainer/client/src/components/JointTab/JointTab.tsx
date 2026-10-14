import { IconCurrentLocation, IconEye, IconEyeOff, IconPencil, IconRefresh, IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FusionError, request } from '../../connector/fusionBridge';
import type { JointInfo, JointList, JointMotion, JointSelection } from '../../types/types';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

type Props = {
  booted: boolean;
  active: boolean;
  revision: number;
  selection: JointSelection;
  onSelection: (selection: JointSelection) => void;
};

function domId(prefix: string, token: string) {
  const safe = token.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `${prefix}_${safe || 'item'}`;
}

function messageOf(error: unknown, fallback: string) {
  if (error instanceof FusionError || error instanceof Error) return error.message;
  return fallback;
}

export function JointTab({ booted, active, revision, selection, onSelection }: Props) {
  const { showToast } = useToast();
  const [joints, setJoints] = useState<JointInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState('');
  const [motion, setMotion] = useState<JointMotion>('rigid');
  const [expression, setExpression] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const savingName = useRef(false);
  const cancelRename = useRef(false);

  useEffect(() => {
    if (!booted) return;
    let cancelled = false;
    setLoading(true);
    request<JointList>('joint:list')
      .then((data) => {
        if (cancelled) return;
        setJoints(data.joints);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(messageOf(error, 'Could not load joints.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booted, revision, tick]);

  useEffect(() => {
    if (!selection.motions.length) return;
    setMotion((current) => (selection.motions.some((item) => item.type === current) ? current : selection.motions[0].type));
  }, [selection]);

  const motionOption = selection.motions.find((item) => item.type === motion);
  const valueKind = motionOption?.valueKind ?? 'none';

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return joints;
    return joints.filter((joint) =>
      [joint.name, joint.motionLabel, joint.sideOne, joint.sideTwo, joint.component, joint.isAsBuilt ? 'as-built' : '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [joints, query]);

  const useSelection = async () => {
    setBusy('selection');
    try {
      onSelection(await request<JointSelection>('joint:readSelection'));
    } catch (error) {
      showToast(messageOf(error, 'Could not read the selection.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const createJoint = async (asBuilt: boolean) => {
    setBusy(asBuilt ? 'asBuilt' : 'joint');
    try {
      const created = await request<JointInfo>('joint:add', {
        motion,
        expression,
        asBuilt,
        geometryTokens: selection.geometries.map((item) => item.token),
        occurrenceTokens: selection.occurrences.map((item) => item.token),
      });
      showToast(`Created ${created.motionLabel.toLowerCase()} joint ${created.name}.`, 'success');
      setExpression('');
      setTick((value) => value + 1);
    } catch (error) {
      showToast(messageOf(error, 'Could not create that joint.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const selectJoint = async (token: string) => {
    try {
      await request('joint:select', { token });
    } catch (error) {
      showToast(messageOf(error, 'Could not select that joint.'), 'error');
    }
  };

  const toggleSuppressed = async (joint: JointInfo) => {
    setBusy(joint.token);
    try {
      await request('joint:setSuppressed', { token: joint.token, suppressed: !joint.isSuppressed });
      setTick((value) => value + 1);
    } catch (error) {
      showToast(messageOf(error, 'Could not change suppression.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const removeJoint = async (joint: JointInfo) => {
    setBusy(joint.token);
    try {
      await request('joint:delete', { token: joint.token });
      showToast(`Deleted ${joint.name}.`, 'success');
      setTick((value) => value + 1);
    } catch (error) {
      showToast(messageOf(error, 'Could not delete that joint.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const saveName = async (joint: JointInfo) => {
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    if (savingName.current) return;
    const name = draft.trim();
    setEditing(null);
    if (!name) {
      showToast('Name is required.', 'error');
      return;
    }
    if (name === joint.name) return;
    savingName.current = true;
    setBusy(joint.token);
    try {
      await request('joint:rename', { token: joint.token, name });
      setTick((value) => value + 1);
    } catch (error) {
      showToast(messageOf(error, 'Could not rename that joint.'), 'error');
    } finally {
      savingName.current = false;
      setBusy('');
    }
  };

  const startRename = (joint: JointInfo) => {
    setEditing(joint.token);
    setDraft(joint.name);
  };

  return (
    <section id="cs_jointPanel" className="cs_tabPanel" hidden={!active} role="tabpanel" aria-labelledby="cs_tab_joints">
      <div id="cs_jointCreate" className="cs_create">
        <div id="cs_jointCreateHead" className="cs_createHead">
          <div id="cs_jointCreateTitle" className="cs_createTitle">
            Create
          </div>
          <button
            id="cs_jointUseSelection"
            className="cs_btn cs_btnPrimary"
            type="button"
            disabled={busy === 'selection'}
            onClick={() => void useSelection()}
          >
            Use selection
          </button>
        </div>
        {selection.geometries.length > 0 && (
          <p id="cs_jointSelectionSummary" className="cs_selectionSummary">
            {selection.geometries.map((item) => item.label).join(' · ')}
            {selection.occurrences.length > 0 ? ` (${selection.occurrences.map((item) => item.name).join(' / ')})` : ''}
          </p>
        )}
        {selection.motions.length > 0 && (
          <div id="cs_jointMotions" className="cs_chipRow">
            {selection.motions.map((option) => (
              <button
                key={option.type}
                id={`cs_motion_${option.type}`}
                className={option.type === motion ? 'cs_btn cs_btnSelected' : 'cs_btn'}
                type="button"
                aria-pressed={option.type === motion}
                onClick={() => setMotion(option.type)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {valueKind !== 'none' && (
          <input
            id="cs_jointExpression"
            className="cs_input"
            type="text"
            value={expression}
            placeholder={valueKind === 'angle' ? '0 deg' : '0 mm'}
            aria-label={valueKind === 'angle' ? 'Angle' : 'Distance'}
            onChange={(event) => setExpression(event.target.value)}
          />
        )}
        {(selection.canCreateJoint || selection.canCreateAsBuilt) && (
          <div id="cs_jointCreateActions" className="cs_chipRow">
            {selection.canCreateJoint && (
              <button
                id="cs_jointCreateBtn"
                className="cs_btn cs_btnPrimary"
                type="button"
                disabled={busy === 'joint'}
                onClick={() => void createJoint(false)}
              >
                Create joint
              </button>
            )}
            {selection.canCreateAsBuilt && (
              <button id="cs_asBuiltCreateBtn" className="cs_btn" type="button" disabled={busy === 'asBuilt'} onClick={() => void createJoint(true)}>
                Create as-built
              </button>
            )}
          </div>
        )}
        {selection.error && (
          <p id="cs_jointSelectionError" className="cs_inlineError">
            {selection.error}
          </p>
        )}
        {selection.geometries.length === 0 && !selection.error && (
          <p id="cs_jointSelectionHint" className="cs_hint">
            Select two faces, edges, points, or components, then click Use selection.
          </p>
        )}
      </div>

      <div id="cs_jointToolbar" className="cs_toolbar">
        <div id="cs_jointSearch" className="cs_search">
          <IconSearch size={14} className="cs_searchIcon" />
          <input
            id="cs_jointSearchInput"
            className="cs_input cs_searchInput"
            type="search"
            placeholder="Search joints"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button id="cs_jointSearchClear" className="cs_iconBtn cs_searchClear" type="button" aria-label="Clear search" onClick={() => setQuery('')}>
              <IconX size={14} />
            </button>
          )}
        </div>
        <span id="cs_jointCount" className="cs_count">
          {loading ? 'Loading…' : `${joints.length} joints`}
        </span>
        <button id="cs_jointRefresh" className="cs_iconBtn" type="button" title="Refresh" aria-label="Refresh joints" onClick={() => setTick((value) => value + 1)}>
          <IconRefresh size={16} />
        </button>
      </div>

      <div id="cs_jointList" className="cs_list">
        {loadError && <EmptyState id="cs_jointLoadError" title="Could not load joints" message={loadError} />}
        {!loadError && !loading && joints.length === 0 && (
          <EmptyState id="cs_jointEmpty" title="No joints" message="Create a joint from two faces, edges, or points." />
        )}
        {!loadError && !loading && joints.length > 0 && filtered.length === 0 && (
          <EmptyState id="cs_jointNoMatches" title="No matches" message="Try a different joint name, type, or component." />
        )}
        {!loadError &&
          filtered.map((joint) => (
            <article
              key={joint.token}
              id={domId('cs_joint', joint.token)}
              className={joint.isSuppressed ? 'cs_joint cs_jointSuppressed' : 'cs_joint'}
            >
              <div id={domId('cs_jointMain', joint.token)} className="cs_jointMain">
                {editing === joint.token ? (
                  <input
                    id={domId('cs_jointNameInput', joint.token)}
                    className="cs_input cs_nameInput"
                    value={draft}
                    aria-label={`Rename ${joint.name}`}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => void saveName(joint)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      } else if (event.key === 'Escape') {
                        cancelRename.current = true;
                        setEditing(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    id={domId('cs_jointSelect', joint.token)}
                    className="cs_jointSelect"
                    type="button"
                    onClick={() => void selectJoint(joint.token)}
                  >
                    <span id={domId('cs_jointName', joint.token)} className="cs_jointName">
                      {joint.name}
                    </span>
                    <span id={domId('cs_jointMeta', joint.token)} className="cs_jointMeta">
                      <span id={domId('cs_jointMotion', joint.token)} className="cs_badge">
                        {joint.motionLabel}
                      </span>
                      {joint.isAsBuilt && (
                        <span id={domId('cs_jointAsBuilt', joint.token)} className="cs_badge cs_badgeMuted">
                          As-built
                        </span>
                      )}
                      <span id={domId('cs_jointSides', joint.token)} className="cs_muted">
                        {joint.sideOne} / {joint.sideTwo}
                      </span>
                    </span>
                  </button>
                )}
              </div>
              <div id={domId('cs_jointActions', joint.token)} className="cs_rowActions">
                <button
                  id={domId('cs_jointRename', joint.token)}
                  className="cs_iconBtn"
                  type="button"
                  title="Rename"
                  aria-label={`Rename ${joint.name}`}
                  onClick={() => startRename(joint)}
                >
                  <IconPencil size={15} />
                </button>
                <button
                  id={domId('cs_jointSuppress', joint.token)}
                  className="cs_iconBtn"
                  type="button"
                  title={joint.isSuppressed ? 'Unsuppress' : 'Suppress'}
                  aria-label={joint.isSuppressed ? `Unsuppress ${joint.name}` : `Suppress ${joint.name}`}
                  aria-pressed={joint.isSuppressed}
                  disabled={busy === joint.token}
                  onClick={() => void toggleSuppressed(joint)}
                >
                  {joint.isSuppressed ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
                <button
                  id={domId('cs_jointLocate', joint.token)}
                  className="cs_iconBtn"
                  type="button"
                  title="Select joint"
                  aria-label={`Select ${joint.name}`}
                  onClick={() => void selectJoint(joint.token)}
                >
                  <IconCurrentLocation size={15} />
                </button>
                <button
                  id={domId('cs_jointDelete', joint.token)}
                  className="cs_iconBtn cs_iconBtnDanger"
                  type="button"
                  title="Delete joint"
                  aria-label={`Delete ${joint.name}`}
                  disabled={busy === joint.token}
                  onClick={() => void removeJoint(joint)}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}
