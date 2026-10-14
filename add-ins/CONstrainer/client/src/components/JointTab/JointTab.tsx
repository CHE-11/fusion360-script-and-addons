import { IconArrowsExchange, IconChevronDown, IconChevronRight, IconRefresh, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FusionError, request } from '../../connector/fusionBridge';
import {
  JOINT_MOTIONS,
  type JointFocus,
  type JointFocusKind,
  type JointGeometryRef,
  type JointInfo,
  type JointList,
  type JointMotion,
  type JointRelated,
  type JointSelection,
} from '../../types/types';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';
import { JointRow, jointDomId } from './JointRow';

type Props = {
  booted: boolean;
  active: boolean;
  revision: number;
  selection: JointSelection;
  onSelection: (selection: JointSelection) => void;
  onAvailability: (allowed: boolean) => void;
};

type Slot = JointGeometryRef | null;

type JointGroup = {
  name: string;
  token: string;
  joints: JointInfo[];
};

type FocusView = {
  focus: JointFocus;
  related: JointRelated;
};

const SLOT_NAMES = ['First', 'Second'] as const;

const FOCUS_NOUNS: Record<JointFocusKind, string> = {
  planarFace: 'face',
  face: 'face',
  curve: 'edge',
  point: 'point',
  jointOrigin: 'joint origin',
  body: 'body',
  component: 'component',
};

// Selecting a joint from the list replaces the canvas selection, so keep the focus view briefly.
const KEEP_FOCUS_MS = 1500;

function messageOf(error: unknown, fallback: string) {
  if (error instanceof FusionError || error instanceof Error) return error.message;
  return fallback;
}

function groupJoints(joints: JointInfo[]): JointGroup[] {
  const groups: JointGroup[] = [];
  for (const joint of joints) {
    const token = joint.componentToken || joint.component || 'assembly';
    const existing = groups.find((group) => group.token === token);
    if (existing) existing.joints.push(joint);
    else groups.push({ name: joint.component || 'Assembly', token, joints: [joint] });
  }
  return groups;
}

function slotText(slot: JointGeometryRef) {
  return slot.occurrenceName && !slot.label.includes(slot.occurrenceName) ? `${slot.label} · ${slot.occurrenceName}` : slot.label;
}

export function JointTab({ booted, active, revision, selection, onSelection, onAvailability }: Props) {
  const { showToast } = useToast();
  const [joints, setJoints] = useState<JointInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState('');
  const [motion, setMotion] = useState<JointMotion>('rigid');
  const [expression, setExpression] = useState('');
  const [slots, setSlots] = useState<[Slot, Slot]>([null, null]);
  const [createOpen, setCreateOpen] = useState(true);
  const [focusView, setFocusView] = useState<FocusView | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const savingName = useRef(false);
  const cancelRename = useRef(false);
  const keepFocusUntil = useRef(0);

  useEffect(() => {
    if (!booted) return;
    let cancelled = false;
    setLoading(true);
    request<JointList>('joint:list')
      .then((data) => {
        if (cancelled) return;
        setJoints(data.joints);
        setLoadError(null);
        if (!data.jointsAllowed) onAvailability(false);
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
  }, [booted, revision, tick, onAvailability]);

  useEffect(() => {
    setSlots([null, null]);
    setFocusView(null);
  }, [revision]);

  useEffect(() => {
    if (selection.focus) {
      setFocusView({ focus: selection.focus, related: selection.related });
    } else if (Date.now() > keepFocusUntil.current) {
      setFocusView(null);
    }
  }, [selection]);

  const focusToken = focusView?.focus.token ?? '';
  useEffect(() => {
    setShowAll(false);
  }, [focusToken]);

  const motionOption = JOINT_MOTIONS.find((item) => item.type === motion);
  const valueKind = motionOption?.valueKind ?? 'none';

  const jointsByToken = useMemo(() => new Map(joints.map((joint) => [joint.token, joint])), [joints]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (joint: JointInfo) =>
      !needle ||
      [
        joint.name,
        joint.motionLabel,
        joint.valueLabel,
        joint.sideOne,
        joint.sideTwo,
        joint.component,
        joint.kind === 'asBuilt' ? 'as-built joint' : 'joint',
        joint.isSuppressed ? 'suppressed' : '',
        joint.isLightBulbOn ? '' : 'hidden',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
  }, [query]);

  const filtered = useMemo(() => joints.filter(matches), [joints, matches]);
  const groups = useMemo(() => groupJoints(filtered), [filtered]);

  const related = useMemo(() => {
    const fresh = (items: JointInfo[]) => items.map((item) => jointsByToken.get(item.token) ?? item).filter(matches);
    return {
      direct: fresh(focusView?.related.direct ?? []),
      component: fresh(focusView?.related.component ?? []),
    };
  }, [focusView, jointsByToken, matches]);

  const filledSlots = slots.filter((slot): slot is JointGeometryRef => !!slot);
  const occurrenceTokens = Array.from(new Set(filledSlots.map((slot) => slot.occurrenceToken).filter(Boolean)));
  const canCreateJoint = !!slots[0] && !!slots[1];
  const canCreateAsBuilt = !!slots[0] && occurrenceTokens.length === 2;
  const selectedTokens = selection.geometries.map((item) => item.token);
  const slotsMatchSelection =
    selectedTokens.length >= 2 && slots[0]?.token === selectedTokens[0] && slots[1]?.token === selectedTokens[1];

  const reload = () => setTick((value) => value + 1);

  const dropFromFocus = (token: string) => {
    setFocusView((current) =>
      current && {
        ...current,
        related: {
          direct: current.related.direct.filter((item) => item.token !== token),
          component: current.related.component.filter((item) => item.token !== token),
        },
      }
    );
  };

  const setSlot = (index: 0 | 1) => {
    const other = slots[index === 0 ? 1 : 0];
    const pick = selection.geometries.find((item) => item.token !== other?.token);
    if (!pick) {
      showToast('That geometry is already in the other slot. Select something else.', 'info');
      return;
    }
    setSlots((current) => (index === 0 ? [pick, current[1]] : [current[0], pick]));
  };

  const clearSlot = (index: 0 | 1) => {
    setSlots((current) => (index === 0 ? [null, current[1]] : [current[0], null]));
  };

  const useBoth = () => {
    setSlots([selection.geometries[0], selection.geometries[1]]);
  };

  const swapSlots = () => {
    setSlots((current) => [current[1], current[0]]);
  };

  const createJoint = async (asBuilt: boolean) => {
    setBusy(asBuilt ? 'asBuilt' : 'joint');
    try {
      const created = await request<JointInfo>('joint:add', {
        motion,
        expression,
        asBuilt,
        geometryTokens: filledSlots.map((slot) => slot.token),
        geometryOccurrenceTokens: filledSlots.map((slot) => slot.occurrenceToken),
        occurrenceTokens,
      });
      showToast(`Created ${created.motionLabel.toLowerCase()} joint ${created.name}.`, 'success');
      setExpression('');
      setSlots([null, null]);
      reload();
      request<JointSelection>('joint:readSelection')
        .then(onSelection)
        .catch(() => {
          // The next canvas selection refreshes the focus view.
        });
    } catch (error) {
      showToast(messageOf(error, 'Could not create that joint.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const selectJoint = async (token: string) => {
    keepFocusUntil.current = Date.now() + KEEP_FOCUS_MS;
    try {
      await request('joint:select', { token });
    } catch (error) {
      showToast(messageOf(error, 'Could not select that joint.'), 'error');
    }
  };

  const toggleVisible = async (joint: JointInfo) => {
    setBusy(joint.token);
    try {
      await request('joint:setVisible', { token: joint.token, visible: !joint.isLightBulbOn });
      reload();
    } catch (error) {
      showToast(messageOf(error, 'Could not change visibility.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const toggleSuppressed = async (joint: JointInfo) => {
    setBusy(joint.token);
    try {
      await request('joint:setSuppressed', { token: joint.token, suppressed: !joint.isSuppressed });
      reload();
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
      dropFromFocus(joint.token);
      reload();
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
      reload();
    } catch (error) {
      showToast(messageOf(error, 'Could not rename that joint.'), 'error');
    } finally {
      savingName.current = false;
      setBusy('');
    }
  };

  const renderRow = (joint: JointInfo) => (
    <JointRow
      key={joint.token}
      joint={joint}
      busy={busy === joint.token}
      editing={editing === joint.token}
      draft={draft}
      onDraftChange={setDraft}
      onStartRename={() => {
        setEditing(joint.token);
        setDraft(joint.name);
      }}
      onSaveName={() => void saveName(joint)}
      onCancelRename={() => {
        cancelRename.current = true;
        setEditing(null);
      }}
      onSelect={() => void selectJoint(joint.token)}
      onToggleVisible={() => void toggleVisible(joint)}
      onToggleSuppressed={() => void toggleSuppressed(joint)}
      onDelete={() => void removeJoint(joint)}
    />
  );

  const focus = focusView?.focus ?? null;
  const focusNoun = focus ? FOCUS_NOUNS[focus.kind] ?? 'item' : '';
  const showFocus = !!focus && !showAll;

  return (
    <section id="cs_jointPanel" className="cs_tabPanel" hidden={!active} role="tabpanel" aria-labelledby="cs_tab_joints">
      <div id="cs_jointCreate" className="cs_create">
        <div id="cs_jointCreateHead" className="cs_createHead">
          <button
            id="cs_jointCreateToggle"
            className="cs_createToggle"
            type="button"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((value) => !value)}
          >
            {createOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            <span id="cs_jointCreateTitle" className="cs_createTitle">
              New joint
            </span>
          </button>
          {createOpen && (slots[0] || slots[1]) && (
            <button id="cs_jointSwap" className="cs_iconBtn" type="button" title="Swap first and second" aria-label="Swap first and second" onClick={swapSlots}>
              <IconArrowsExchange size={15} />
            </button>
          )}
        </div>

        {createOpen && (
          <>
            {slots.map((slot, index) => {
              const slotIndex = index as 0 | 1;
              return (
                <div key={SLOT_NAMES[slotIndex]} id={`cs_jointSlot_${slotIndex}`} className="cs_slot">
                  <span id={`cs_jointSlotLabel_${slotIndex}`} className="cs_slotLabel">
                    {SLOT_NAMES[slotIndex]}
                  </span>
                  <span
                    id={`cs_jointSlotValue_${slotIndex}`}
                    className={slot ? 'cs_slotValue' : 'cs_slotValue cs_slotEmpty'}
                    title={slot ? slotText(slot) : undefined}
                  >
                    {slot ? slotText(slot) : 'Not set'}
                  </span>
                  <button
                    id={`cs_jointSlotSet_${slotIndex}`}
                    className="cs_btn"
                    type="button"
                    disabled={selection.geometries.length === 0}
                    title={selection.geometries.length === 0 ? 'Select a face, edge, point, or joint origin first' : 'Use the canvas selection'}
                    onClick={() => setSlot(slotIndex)}
                  >
                    Set
                  </button>
                  {slot && (
                    <button
                      id={`cs_jointSlotClear_${slotIndex}`}
                      className="cs_iconBtn"
                      type="button"
                      aria-label={`Clear ${SLOT_NAMES[slotIndex].toLowerCase()} geometry`}
                      onClick={() => clearSlot(slotIndex)}
                    >
                      <IconX size={14} />
                    </button>
                  )}
                </div>
              );
            })}

            {selection.geometries.length >= 2 && !slotsMatchSelection && (
              <div id="cs_jointUseBothRow" className="cs_chipRow">
                <button id="cs_jointUseBoth" className="cs_btn" type="button" onClick={useBoth}>
                  Use both selected
                </button>
              </div>
            )}

            {!slots[0] && !slots[1] && selection.geometries.length === 0 && (
              <p id="cs_jointSelectionHint" className="cs_hint">
                Select a face, edge, point, or joint origin in the canvas, then click Set. Hold Ctrl to select two at once.
              </p>
            )}

            <div id="cs_jointMotions" className="cs_chipRow">
              {JOINT_MOTIONS.map((option) => (
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

            <div id="cs_jointCreateActions" className="cs_chipRow">
              <button
                id="cs_jointCreateBtn"
                className="cs_btn cs_btnPrimary"
                type="button"
                disabled={!canCreateJoint || busy === 'joint'}
                title={canCreateJoint ? undefined : 'Set both geometries first'}
                onClick={() => void createJoint(false)}
              >
                Create joint
              </button>
              <button
                id="cs_asBuiltCreateBtn"
                className="cs_btn"
                type="button"
                disabled={!canCreateAsBuilt || busy === 'asBuilt'}
                title={canCreateAsBuilt ? 'Keeps the components where they are' : 'Set geometry on two different components first'}
                onClick={() => void createJoint(true)}
              >
                Create as-built
              </button>
            </div>

            {selection.error && (
              <p id="cs_jointSelectionError" className="cs_inlineError">
                {selection.error}
              </p>
            )}
          </>
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
        <button id="cs_jointRefresh" className="cs_iconBtn" type="button" title="Refresh" aria-label="Refresh joints" onClick={reload}>
          <IconRefresh size={16} />
        </button>
      </div>

      <div id="cs_jointList" className="cs_list">
        {focus && (
          <div id="cs_jointFocus" className="cs_focus">
            <div id="cs_jointFocusText" className="cs_focusText">
              <span id="cs_jointFocusLabel" className="cs_focusTitle">
                {focus.label}
              </span>
              {focus.occurrenceName && focus.kind !== 'component' && (
                <span id="cs_jointFocusOccurrence" className="cs_muted">
                  {focus.occurrenceName}
                </span>
              )}
            </div>
            <button id="cs_jointFocusToggle" className="cs_btn" type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show selected' : 'Show all'}
            </button>
            <button id="cs_jointFocusClear" className="cs_iconBtn" type="button" aria-label="Clear selected item" onClick={() => setFocusView(null)}>
              <IconX size={14} />
            </button>
          </div>
        )}

        {loadError && <EmptyState id="cs_jointLoadError" title="Could not load joints" message={loadError} />}

        {!loadError && showFocus && (
          <>
            <section id="cs_jointDirect" className="cs_group">
              <h2 id="cs_jointDirectTitle" className="cs_groupTitle">
                On this {focusNoun} · {related.direct.length}
              </h2>
              {related.direct.length === 0 && (
                <p id="cs_jointDirectEmpty" className="cs_hint cs_groupEmpty">
                  No joints use this {focusNoun}.
                </p>
              )}
              {related.direct.map(renderRow)}
            </section>
            {focus.kind !== 'component' && focus.occurrenceName && (
              <section id="cs_jointComponent" className="cs_group">
                <h2 id="cs_jointComponentTitle" className="cs_groupTitle">
                  Other joints on {focus.occurrenceName} · {related.component.length}
                </h2>
                {related.component.length === 0 && (
                  <p id="cs_jointComponentEmpty" className="cs_hint cs_groupEmpty">
                    No other joints on this component.
                  </p>
                )}
                {related.component.map(renderRow)}
              </section>
            )}
          </>
        )}

        {!loadError && !showFocus && (
          <>
            {!loading && joints.length === 0 && (
              <EmptyState id="cs_jointEmpty" title="No joints" message="Set two geometries above to create one." />
            )}
            {!loading && joints.length > 0 && filtered.length === 0 && (
              <EmptyState id="cs_jointNoMatches" title="No matches" message="Try a different joint name, type, or component." />
            )}
            {groups.map((group) => (
              <section key={group.token} id={jointDomId('cs_jointGroup', group.token)} className="cs_group">
                <h2 id={jointDomId('cs_jointGroupName', group.token)} className="cs_groupTitle">
                  {group.name}
                </h2>
                {group.joints.map(renderRow)}
              </section>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
