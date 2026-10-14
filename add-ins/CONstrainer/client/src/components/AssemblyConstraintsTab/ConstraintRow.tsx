import {
  IconBan,
  IconChevronDown,
  IconChevronRight,
  IconCurrentLocation,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconSwitchVertical,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import type { AssemblyConstraintInfo, ConstraintRelationship } from '../../types/types';

type Props = {
  constraint: AssemblyConstraintInfo;
  busy: boolean;
  expanded: boolean;
  editing: boolean;
  draft: string;
  onToggleExpanded: () => void;
  onDraftChange: (value: string) => void;
  onStartRename: () => void;
  onSaveName: () => void;
  onCancelRename: () => void;
  onSelect: () => void;
  onHighlight: () => void;
  onClearHighlight: () => void;
  onToggleVisible: () => void;
  onToggleSuppressed: () => void;
  onDelete: () => void;
  onSetValue: (index: number, expression: string) => void;
  onSetFlipped: (index: number, flipped: boolean) => void;
  onSetRelationshipSuppressed: (index: number, suppressed: boolean) => void;
};

export function constraintDomId(prefix: string, token: string) {
  const safe = token.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `${prefix}_${safe || 'item'}`;
}

function visibilityTitle(constraint: AssemblyConstraintInfo) {
  if (!constraint.isLightBulbOn) return `Show ${constraint.name}`;
  if (!constraint.isVisible) return `${constraint.name} is hidden by a parent component or folder`;
  return `Hide ${constraint.name}`;
}

export function ConstraintRow({
  constraint,
  busy,
  expanded,
  editing,
  draft,
  onToggleExpanded,
  onDraftChange,
  onStartRename,
  onSaveName,
  onCancelRename,
  onSelect,
  onHighlight,
  onClearHighlight,
  onToggleVisible,
  onToggleSuppressed,
  onDelete,
  onSetValue,
  onSetFlipped,
  onSetRelationshipSuppressed,
}: Props) {
  const id = (prefix: string) => constraintDomId(prefix, constraint.token);
  const rowClass = ['cs_constraintCard', constraint.isSuppressed ? 'cs_jointSuppressed' : '', constraint.isLightBulbOn ? '' : 'cs_jointHidden']
    .filter(Boolean)
    .join(' ');

  return (
    <article
      id={id('cs_asmConstraint')}
      className={rowClass}
      onMouseEnter={onHighlight}
      onMouseLeave={onClearHighlight}
    >
      <div id={id('cs_asmConstraintHead')} className="cs_constraintHead">
        <button
          id={id('cs_asmConstraintToggle')}
          className="cs_iconBtn"
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${constraint.name}` : `Expand ${constraint.name}`}
          onClick={onToggleExpanded}
        >
          {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </button>
        <div id={id('cs_asmConstraintMain')} className="cs_jointMain">
          {editing ? (
            <input
              id={id('cs_asmConstraintNameInput')}
              className="cs_input cs_nameInput"
              value={draft}
              aria-label={`Rename ${constraint.name}`}
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
            <button id={id('cs_asmConstraintSelect')} className="cs_jointSelect" type="button" onClick={onSelect}>
              <span id={id('cs_asmConstraintName')} className="cs_jointName">
                {constraint.name}
              </span>
              <span id={id('cs_asmConstraintMeta')} className="cs_jointMeta">
                <span id={id('cs_asmConstraintType')} className="cs_badge">
                  {constraint.typeLabel}
                </span>
                {constraint.relationships.length > 1 && (
                  <span id={id('cs_asmConstraintCount')} className="cs_muted">
                    {constraint.relationships.length} relationships
                  </span>
                )}
                {constraint.isSuppressed && (
                  <span id={id('cs_asmConstraintSuppressed')} className="cs_badge cs_badgeWarn">
                    Suppressed
                  </span>
                )}
                {constraint.health !== 'ok' && (
                  <span
                    id={id('cs_asmConstraintHealth')}
                    className={constraint.health === 'error' ? 'cs_badge cs_badgeError' : 'cs_badge cs_badgeWarn'}
                    title={constraint.message || undefined}
                  >
                    {constraint.health === 'error' ? 'Error' : 'Warning'}
                  </span>
                )}
                <span id={id('cs_asmConstraintSides')} className="cs_muted">
                  {constraint.sideOne} / {constraint.sideTwo}
                </span>
              </span>
            </button>
          )}
        </div>
        <div id={id('cs_asmConstraintActions')} className="cs_rowActions">
          <button
            id={id('cs_asmConstraintRename')}
            className="cs_iconBtn"
            type="button"
            title="Rename"
            aria-label={`Rename ${constraint.name}`}
            onClick={onStartRename}
          >
            <IconPencil size={15} />
          </button>
          <button
            id={id('cs_asmConstraintVisible')}
            className="cs_iconBtn"
            type="button"
            title={visibilityTitle(constraint)}
            aria-label={visibilityTitle(constraint)}
            aria-pressed={constraint.isLightBulbOn}
            disabled={busy}
            onClick={onToggleVisible}
          >
            {constraint.isLightBulbOn ? <IconEye size={15} /> : <IconEyeOff size={15} />}
          </button>
          <button
            id={id('cs_asmConstraintSuppress')}
            className="cs_iconBtn"
            type="button"
            title={constraint.isSuppressed ? 'Unsuppress' : 'Suppress'}
            aria-label={constraint.isSuppressed ? `Unsuppress ${constraint.name}` : `Suppress ${constraint.name}`}
            aria-pressed={constraint.isSuppressed}
            disabled={busy}
            onClick={onToggleSuppressed}
          >
            <IconBan size={15} />
          </button>
          <button
            id={id('cs_asmConstraintLocate')}
            className="cs_iconBtn"
            type="button"
            title="Highlight in canvas and timeline"
            aria-label={`Highlight ${constraint.name} in the canvas and timeline`}
            onClick={onSelect}
          >
            <IconCurrentLocation size={15} />
          </button>
          <button
            id={id('cs_asmConstraintDelete')}
            className="cs_iconBtn cs_iconBtnDanger"
            type="button"
            title="Delete constraint"
            aria-label={`Delete ${constraint.name}`}
            disabled={busy}
            onClick={onDelete}
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>

      {expanded && (
        <ul id={id('cs_asmRelationships')} className="cs_relationships">
          {constraint.message && (
            <li id={id('cs_asmConstraintMessage')} className={constraint.health === 'error' ? 'cs_inlineError cs_relationshipNote' : 'cs_hint cs_relationshipNote'}>
              {constraint.message}
            </li>
          )}
          {constraint.relationships.length === 0 && (
            <li id={id('cs_asmRelationshipsEmpty')} className="cs_hint cs_relationshipNote">
              Fusion did not report any relationships for this constraint.
            </li>
          )}
          {constraint.relationships.map((relationship) => (
            <RelationshipRow
              key={relationship.index}
              token={constraint.token}
              relationship={relationship}
              busy={busy}
              onSetValue={(expression) => onSetValue(relationship.index, expression)}
              onSetFlipped={() => onSetFlipped(relationship.index, !relationship.isFlipped)}
              onSetSuppressed={() => onSetRelationshipSuppressed(relationship.index, !relationship.isSuppressed)}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

type RelationshipProps = {
  token: string;
  relationship: ConstraintRelationship;
  busy: boolean;
  onSetValue: (expression: string) => void;
  onSetFlipped: () => void;
  onSetSuppressed: () => void;
};

function RelationshipRow({ token, relationship, busy, onSetValue, onSetFlipped, onSetSuppressed }: RelationshipProps) {
  const [value, setValue] = useState(relationship.expression);
  const rowId = (prefix: string) => constraintDomId(prefix, `${token}_${relationship.index}`);
  const isAngle = relationship.type === 'angle';

  useEffect(() => {
    setValue(relationship.expression);
  }, [relationship.expression]);

  const commit = () => {
    const next = value.trim();
    if (!next || next === relationship.expression) {
      setValue(relationship.expression);
      return;
    }
    onSetValue(next);
  };

  return (
    <li id={rowId('cs_asmRelationship')} className={relationship.isSuppressed ? 'cs_relationship cs_jointSuppressed' : 'cs_relationship'}>
      <div id={rowId('cs_asmRelationshipInfo')} className="cs_relationshipInfo">
        <span id={rowId('cs_asmRelationshipName')} className="cs_constraintLabel">
          {relationship.name}
          <span id={rowId('cs_asmRelationshipType')} className="cs_badge cs_badgeMuted cs_relationshipType">
            {isAngle ? 'Angle' : 'Mate'}
          </span>
          {relationship.isFlipped && (
            <span id={rowId('cs_asmRelationshipFlipped')} className="cs_badge cs_badgeMuted cs_relationshipType">
              Flipped
            </span>
          )}
        </span>
        <span id={rowId('cs_asmRelationshipEntities')} className="cs_muted" title={`${relationship.entityOne} / ${relationship.entityTwo}`}>
          {relationship.entityOne} / {relationship.entityTwo}
        </span>
      </div>
      {relationship.parameterName || relationship.expression ? (
        <input
          id={rowId('cs_asmRelationshipValue')}
          className="cs_input cs_relationshipValue"
          type="text"
          value={value}
          placeholder={isAngle ? '0 deg' : '0 mm'}
          aria-label={`${isAngle ? 'Angle' : 'Offset'} for ${relationship.name}`}
          title={relationship.parameterName ? `Parameter ${relationship.parameterName}` : undefined}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              setValue(relationship.expression);
            }
          }}
        />
      ) : null}
      <button
        id={rowId('cs_asmRelationshipFlip')}
        className="cs_iconBtn"
        type="button"
        title={relationship.isFlipped ? 'Unflip direction' : 'Flip direction'}
        aria-label={relationship.isFlipped ? `Unflip ${relationship.name}` : `Flip ${relationship.name}`}
        aria-pressed={relationship.isFlipped}
        disabled={busy}
        onClick={onSetFlipped}
      >
        <IconSwitchVertical size={15} />
      </button>
      <button
        id={rowId('cs_asmRelationshipSuppress')}
        className="cs_iconBtn"
        type="button"
        title={relationship.isSuppressed ? 'Unsuppress relationship' : 'Suppress relationship'}
        aria-label={relationship.isSuppressed ? `Unsuppress ${relationship.name}` : `Suppress ${relationship.name}`}
        aria-pressed={relationship.isSuppressed}
        disabled={busy}
        onClick={onSetSuppressed}
      >
        <IconBan size={15} />
      </button>
    </li>
  );
}
