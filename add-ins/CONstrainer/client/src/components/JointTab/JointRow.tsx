import { IconBan, IconCurrentLocation, IconEye, IconEyeOff, IconPencil, IconTrash } from '@tabler/icons-react';

import type { JointInfo } from '../../types/types';

type Props = {
  joint: JointInfo;
  busy: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartRename: () => void;
  onSaveName: () => void;
  onCancelRename: () => void;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleSuppressed: () => void;
  onDelete: () => void;
};

export function jointDomId(prefix: string, token: string) {
  const safe = token.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `${prefix}_${safe || 'item'}`;
}

function visibilityTitle(joint: JointInfo) {
  if (!joint.isLightBulbOn) return `Show ${joint.name}`;
  if (!joint.isVisible) return `${joint.name} is hidden by a parent component or the Joints folder`;
  return `Hide ${joint.name}`;
}

export function JointRow({
  joint,
  busy,
  editing,
  draft,
  onDraftChange,
  onStartRename,
  onSaveName,
  onCancelRename,
  onSelect,
  onToggleVisible,
  onToggleSuppressed,
  onDelete,
}: Props) {
  const id = (prefix: string) => jointDomId(prefix, joint.token);
  const rowClass = ['cs_joint', joint.isSuppressed ? 'cs_jointSuppressed' : '', joint.isLightBulbOn ? '' : 'cs_jointHidden']
    .filter(Boolean)
    .join(' ');

  return (
    <article id={id('cs_joint')} className={rowClass}>
      <div id={id('cs_jointMain')} className="cs_jointMain">
        {editing ? (
          <input
            id={id('cs_jointNameInput')}
            className="cs_input cs_nameInput"
            value={draft}
            aria-label={`Rename ${joint.name}`}
            autoFocus
            onChange={(event) => onDraftChange(event.target.value)}
            onBlur={onSaveName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                onCancelRename();
              }
            }}
          />
        ) : (
          <button id={id('cs_jointSelect')} className="cs_jointSelect" type="button" onClick={onSelect}>
            <span id={id('cs_jointName')} className="cs_jointName">
              {joint.name}
            </span>
            <span id={id('cs_jointMeta')} className="cs_jointMeta">
              <span id={id('cs_jointMotion')} className="cs_badge">
                {joint.motionLabel}
              </span>
              {joint.valueLabel && (
                <span id={id('cs_jointValue')} className="cs_muted">
                  {joint.valueLabel}
                </span>
              )}
              {joint.isAsBuilt && (
                <span id={id('cs_jointAsBuilt')} className="cs_badge cs_badgeMuted">
                  As-built
                </span>
              )}
              {joint.warning && (
                <span id={id('cs_jointWarning')} className="cs_badge cs_badgeWarn" title={joint.warning}>
                  Warning
                </span>
              )}
              {joint.isSuppressed && (
                <span id={id('cs_jointSuppressed')} className="cs_badge cs_badgeWarn">
                  Suppressed
                </span>
              )}
              <span id={id('cs_jointSides')} className="cs_muted">
                {joint.sideOne} / {joint.sideTwo}
              </span>
            </span>
          </button>
        )}
      </div>
      <div id={id('cs_jointActions')} className="cs_rowActions">
        <button id={id('cs_jointRename')} className="cs_iconBtn" type="button" title="Rename" aria-label={`Rename ${joint.name}`} onClick={onStartRename}>
          <IconPencil size={15} />
        </button>
        <button
          id={id('cs_jointVisible')}
          className="cs_iconBtn"
          type="button"
          title={visibilityTitle(joint)}
          aria-label={visibilityTitle(joint)}
          aria-pressed={joint.isLightBulbOn}
          disabled={busy}
          onClick={onToggleVisible}
        >
          {joint.isLightBulbOn ? <IconEye size={15} /> : <IconEyeOff size={15} />}
        </button>
        <button
          id={id('cs_jointSuppress')}
          className="cs_iconBtn"
          type="button"
          title={joint.isSuppressed ? 'Unsuppress' : 'Suppress'}
          aria-label={joint.isSuppressed ? `Unsuppress ${joint.name}` : `Suppress ${joint.name}`}
          aria-pressed={joint.isSuppressed}
          disabled={busy}
          onClick={onToggleSuppressed}
        >
          <IconBan size={15} />
        </button>
        <button id={id('cs_jointLocate')} className="cs_iconBtn" type="button" title="Select joint" aria-label={`Select ${joint.name}`} onClick={onSelect}>
          <IconCurrentLocation size={15} />
        </button>
        <button
          id={id('cs_jointDelete')}
          className="cs_iconBtn cs_iconBtnDanger"
          type="button"
          title="Delete joint"
          aria-label={`Delete ${joint.name}`}
          disabled={busy}
          onClick={onDelete}
        >
          <IconTrash size={15} />
        </button>
      </div>
    </article>
  );
}
