import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconPlus,
  IconSearch,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

import { findUnit } from '../../data/fusionUnits';
import { copyToClipboard } from '../../utils/clipboard';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';
import { UnitSelect } from '../common/UnitSelect';

export type TableColumn = 'name' | 'expression' | 'value' | 'unit' | 'comment' | 'category';

export type TableRow = {
  name: string;
  expression: string;
  value?: string;
  unit?: string;
  comment?: string;
  category?: string;
  editable: boolean;
  deletable: boolean;
  /** Fields this row can change. Falls back to the table-level list. */
  editableFields?: DraftField[];
};

export type DraftRow = {
  name: string;
  expression: string;
  unit: string;
  comment: string;
  category: string;
};

export type DraftField = 'name' | 'expression' | 'unit' | 'comment' | 'category';

const COLUMN_LABELS: Record<TableColumn, string> = {
  name: 'Name',
  expression: 'Expression',
  value: 'Value',
  unit: 'Unit',
  comment: 'Comment',
  category: 'Category',
};

const COLUMN_TO_FIELD: Partial<Record<TableColumn, DraftField>> = {
  name: 'name',
  expression: 'expression',
  unit: 'unit',
  comment: 'comment',
  category: 'category',
};

const NEW_KEY = '__new__';

/** Display columns that open the row editor when clicked. */
const CLICK_EDIT_COLUMNS: TableColumn[] = ['name', 'expression', 'value', 'unit', 'comment'];

const emptyDraft = (): DraftRow => ({ name: '', expression: '', unit: '', comment: '', category: '' });

function cellTitle(col: TableColumn, row: TableRow, canClickEdit: boolean): string | undefined {
  if (col === 'name') {
    const action = canClickEdit
      ? 'Click to edit. Right-click to copy reference.'
      : 'Right-click to copy reference.';
    return `${row.name}. ${action}`;
  }

  const text =
    col === 'expression'
      ? row.expression
      : col === 'value'
        ? (row.value ?? '')
        : col === 'unit'
          ? findUnit(row.unit ?? '')?.label || row.unit || ''
          : col === 'comment'
            ? (row.comment ?? '')
            : col === 'category'
              ? (row.category ?? '')
              : '';

  if (canClickEdit && text) return `${text}. Click to edit.`;
  if (canClickEdit) return 'Click to edit';
  return text || undefined;
}

type SortDir = 'asc' | 'desc';

type Props = {
  idPrefix: string;
  rows: TableRow[];
  columns: TableColumn[];
  editableFields: DraftField[];
  canAdd: boolean;
  addLabel?: string;
  onAdd?: (draft: DraftRow) => Promise<void> | void;
  onEdit?: (originalName: string, draft: DraftRow) => Promise<void> | void;
  onDelete?: (name: string) => Promise<void> | void;
  refName: (name: string) => string;
  busy?: boolean;
  toolbarRight?: ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
};

export function ParamTable({
  idPrefix,
  rows,
  columns,
  editableFields,
  canAdd,
  addLabel = 'Add parameter',
  onAdd,
  onEdit,
  onDelete,
  refName,
  busy,
  toolbarRight,
  emptyTitle = 'No parameters',
  emptyMessage,
}: Props) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<TableColumn>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow>(emptyDraft());
  const pendingFocusId = useRef<string | null>(null);
  const editRowRef = useRef<HTMLTableRowElement | null>(null);
  const draftRef = useRef(draft);
  const editingKeyRef = useRef(editingKey);
  const editSession = useRef(0);
  const originalRef = useRef<DraftRow | null>(null);
  const committing = useRef(false);
  const onAddRef = useRef(onAdd);
  const onEditRef = useRef(onEdit);
  draftRef.current = draft;
  editingKeyRef.current = editingKey;
  onAddRef.current = onAdd;
  onEditRef.current = onEdit;

  const patchDraft = useCallback((patch: Partial<DraftRow>) => {
    if (!editingKeyRef.current) return;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
  }, []);

  const toggleSort = useCallback((col: TableColumn) => {
    setSortCol((prevCol) => {
      if (prevCol === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevCol;
      }
      setSortDir('asc');
      return col;
    });
  }, []);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [r.name, r.comment, r.category, r.expression]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(q))
        )
      : rows.slice();

    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortCol] ?? '').toLowerCase();
      const bv = String((b as Record<string, unknown>)[sortCol] ?? '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return filtered;
  }, [rows, search, sortCol, sortDir]);

  const openEditor = useCallback((key: string, next: DraftRow) => {
    editSession.current += 1;
    draftRef.current = next;
    editingKeyRef.current = key;
    originalRef.current = key === NEW_KEY ? null : next;
    setDraft(next);
    setEditingKey(key);
  }, []);

  const startAdd = useCallback(() => {
    openEditor(NEW_KEY, emptyDraft());
  }, [openEditor]);

  const startEdit = useCallback(
    (row: TableRow) => {
      openEditor(row.name, {
        name: row.name,
        expression: row.expression,
        unit: row.unit ?? '',
        comment: row.comment ?? '',
        category: row.category ?? '',
      });
    },
    [openEditor]
  );

  const beginEditFromCell = useCallback(
    (row: TableRow, col: TableColumn) => {
      if (!CLICK_EDIT_COLUMNS.includes(col) || !row.editable || !onEdit || editingKey) return;
      const fields = row.editableFields ?? editableFields;
      const preferred: DraftField | null = col === 'value' ? 'expression' : (COLUMN_TO_FIELD[col] ?? null);
      const focusField =
        (preferred && fields.includes(preferred) ? preferred : null) ??
        (['expression', 'name', 'comment', 'unit', 'category'] as DraftField[]).find((field) =>
          fields.includes(field)
        ) ??
        null;
      pendingFocusId.current = focusField
        ? focusField === 'unit'
          ? `${idPrefix}_draft_unit_input`
          : `${idPrefix}_draft_${focusField}`
        : null;
      startEdit(row);
    },
    [editableFields, editingKey, idPrefix, onEdit, startEdit]
  );

  useEffect(() => {
    const targetId = pendingFocusId.current;
    if (!editingKey || editingKey === NEW_KEY || !targetId) return;
    pendingFocusId.current = null;
    const node = document.getElementById(targetId) as HTMLInputElement | null;
    if (!node) return;
    node.focus();
    if (targetId.endsWith('_unit_input')) node.click();
  }, [editingKey]);

  const closeEditor = () => {
    editingKeyRef.current = null;
    originalRef.current = null;
    const blank = emptyDraft();
    draftRef.current = blank;
    setEditingKey(null);
    setDraft(blank);
  };

  const cancelEdit = useCallback(() => {
    editSession.current += 1;
    closeEditor();
  }, []);

  const commit = useCallback(async () => {
    if (committing.current) return;
    const session = editSession.current;
    const key = editingKeyRef.current;
    const current = draftRef.current;
    if (!key) return;
    committing.current = true;
    const original = originalRef.current;
    const unchanged =
      !!original &&
      current.name === original.name &&
      current.expression === original.expression &&
      current.unit === original.unit &&
      current.comment === original.comment &&
      current.category === original.category;
    const blankNewRow = key === NEW_KEY && !current.name.trim() && !current.expression.trim();
    try {
      if ((key !== NEW_KEY && unchanged) || blankNewRow) {
        if (editSession.current !== session) return;
        closeEditor();
        return;
      }
      if (key === NEW_KEY) await onAddRef.current?.(current);
      else await onEditRef.current?.(key, current);
      if (editSession.current !== session) return;
      closeEditor();
    } catch {
      // Callback is responsible for surfacing the error; keep the editor open.
    } finally {
      committing.current = false;
    }
  }, []);

  useEffect(() => {
    if (!editingKey) return;

    const unitMenu = () => document.getElementById(`${idPrefix}_draft_unit_list`);
    const inEditor = (target: Node | null) => {
      if (!target) return false;
      if (editRowRef.current?.contains(target)) return true;
      return !!unitMenu()?.contains(target);
    };

    let pointerInside = false;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const inside = target instanceof Node && inEditor(target);
      pointerInside = inside;
      if (inside) {
        // Clicks inside the row move focus before this turn ends. Clear the
        // flag after that so a later Tab still saves when it leaves the row.
        window.setTimeout(() => {
          pointerInside = false;
        }, 0);
        return;
      }
      if (event.button !== 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && editRowRef.current?.contains(active)) {
        // Flush a typed unit before reading the draft. blur() runs focusout
        // before this handler continues, so the draft ref is current.
        active.blur();
      }
      void commit();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      const inRow = target instanceof Node && inEditor(target);
      const active = document.activeElement;
      const focusElsewhere =
        active instanceof HTMLElement &&
        active !== document.body &&
        !inEditor(active);
      if (!inRow && focusElsewhere) return;
      event.preventDefault();
      event.stopPropagation();
      cancelEdit();
    };

    const onFocusOut = (event: FocusEvent) => {
      const fromPointerInside = pointerInside;
      pointerInside = false;
      if (fromPointerInside) return;
      const next = event.relatedTarget;
      if (next instanceof Node && inEditor(next)) return;
      void commit();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [editingKey, idPrefix, commit, cancelEdit]);

  const onCopyRef = useCallback(
    async (name: string) => {
      const ref = refName(name);
      const copied = await copyToClipboard(ref);
      if (copied) {
        const label = ref.replace(/{{/g, '').replace(/}}/g, '');
        showToast(`"${label}" Copied`, 'success');
      } else {
        showToast('Could not copy to the clipboard.', 'error');
      }
    },
    [refName, showToast]
  );

  const colSpan = columns.length + 1;

  const renderEditableCell = (col: TableColumn, row?: TableRow) => {
    const field = COLUMN_TO_FIELD[col];
    const fields = row?.editableFields ?? editableFields;
    if (field && fields.includes(field)) {
      if (field === 'unit') {
        return (
          <div id={`${idPrefix}_draft_unit_slot`} className="pp_editSlot">
            <UnitSelect
              id={`${idPrefix}_draft_unit`}
              value={draft.unit}
              onChange={(unit) => patchDraft({ unit })}
              onCommit={() => void commit()}
              onCancel={cancelEdit}
            />
          </div>
        );
      }
      return (
        <div id={`${idPrefix}_draft_${field}_slot`} className="pp_editSlot">
          <input
            id={`${idPrefix}_draft_${field}`}
            className="pp_input pp_inputInline"
            size={1}
            value={draft[field]}
            placeholder={COLUMN_LABELS[col]}
            onChange={(e) => patchDraft({ [field]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit();
              if (e.key === 'Escape') cancelEdit();
            }}
          />
        </div>
      );
    }
    if (row) return renderDisplayCell(col, row);
    return <span className="pp_muted">-</span>;
  };

  const renderDisplayCell = (col: TableColumn, row: TableRow) => {
    switch (col) {
      case 'name':
        return <span className="pp_cellClip pp_cellName">{row.name}</span>;
      case 'expression':
        return <span className="pp_cellClip pp_cellMono">{row.expression}</span>;
      case 'value':
        return <span className="pp_cellClip pp_cellMono pp_muted">{row.value ?? ''}</span>;
      case 'unit':
        return <span className="pp_cellClip">{row.unit ?? ''}</span>;
      case 'comment':
        return <span className="pp_cellClip pp_muted">{row.comment ?? ''}</span>;
      case 'category':
        return row.category ? (
          <span className="pp_cellClip pp_tag">{row.category}</span>
        ) : (
          <span className="pp_cellClip pp_muted">-</span>
        );
      default:
        return null;
    }
  };

  return (
    <div id={`${idPrefix}_tableWrap`} className="pp_tableWrap">
      <div id={`${idPrefix}_toolbar`} className="pp_tableToolbar">
        <div className="pp_search">
          <IconSearch size={16} className="pp_searchIcon" />
          <input
            id={`${idPrefix}_search`}
            className="pp_input pp_searchInput"
            type="text"
            value={search}
            placeholder="Search parameters..."
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="pp_iconBtn pp_searchClear" title="Clear" onClick={() => setSearch('')}>
              <IconX size={14} />
            </button>
          )}
        </div>
        <div className="pp_toolbarActions">
          {toolbarRight}
          {canAdd && (
            <button
              id={`${idPrefix}_addBtn`}
              className="pp_btn pp_btnPrimary"
              onClick={startAdd}
              disabled={busy || editingKey === NEW_KEY}
            >
              <IconPlus size={16} />
              {addLabel}
            </button>
          )}
        </div>
      </div>

      <div className="pp_tableScroll">
        <table id={`${idPrefix}_table`} className="pp_table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} className="pp_sortable" onClick={() => toggleSort(col)}>
                  <span className="pp_thContent">
                    <span className="pp_thLabel">{COLUMN_LABELS[col]}</span>
                    {sortCol === col ? (
                      sortDir === 'asc' ? (
                        <IconSortAscending size={14} />
                      ) : (
                        <IconSortDescending size={14} />
                      )
                    ) : (
                      <IconSelector size={14} className="pp_muted" />
                    )}
                  </span>
                </th>
              ))}
              <th className="pp_actionsCol">Actions</th>
            </tr>
          </thead>
          <tbody>
            {editingKey === NEW_KEY && (
              <tr id={`${idPrefix}_editRow`} ref={editRowRef} className="pp_editRow">
                {columns.map((col) => (
                  <td key={col}>{renderEditableCell(col)}</td>
                ))}
                <td>
                  <div className="pp_actions">
                    <button
                      id={`${idPrefix}_new_save`}
                      className="pp_iconBtn pp_iconBtnOk"
                      title="Save"
                      onClick={() => void commit()}
                    >
                      <IconCheck size={16} />
                    </button>
                    <button id={`${idPrefix}_new_cancel`} className="pp_iconBtn" title="Cancel" onClick={cancelEdit}>
                      <IconX size={16} />
                    </button>
                    {onEdit && onDelete && (
                      <span id={`${idPrefix}_new_deleteSpacer`} className="pp_actionSpacer" aria-hidden="true" />
                    )}
                  </div>
                </td>
              </tr>
            )}

            {filteredSorted.map((row, rowIndex) => {
              const isEditing = editingKey === row.name;
              return (
                <tr
                  key={row.name}
                  id={isEditing ? `${idPrefix}_editRow` : undefined}
                  ref={isEditing ? editRowRef : undefined}
                  className={isEditing ? 'pp_editRow' : ''}
                >
                  {columns.map((col) => {
                    const canClickEdit =
                      !isEditing &&
                      !editingKey &&
                      row.editable &&
                      !!onEdit &&
                      CLICK_EDIT_COLUMNS.includes(col);
                    const canCopyRef = col === 'name' && !isEditing;
                    return (
                      <td
                        key={col}
                        id={`${idPrefix}_r${rowIndex}_${col}`}
                        className={canClickEdit ? 'pp_cellClick' : undefined}
                        title={isEditing ? undefined : cellTitle(col, row, canClickEdit)}
                        onClick={canClickEdit ? () => beginEditFromCell(row, col) : undefined}
                        onContextMenu={
                          canCopyRef
                            ? (event) => {
                                event.preventDefault();
                                void onCopyRef(row.name);
                              }
                            : undefined
                        }
                      >
                        {isEditing ? renderEditableCell(col, row) : renderDisplayCell(col, row)}
                      </td>
                    );
                  })}
                  <td>
                    <div className="pp_actions">
                      {isEditing ? (
                        <>
                          <button
                            id={`${idPrefix}_r${rowIndex}_save`}
                            className="pp_iconBtn pp_iconBtnOk"
                            title="Save"
                            onClick={() => void commit()}
                          >
                            <IconCheck size={16} />
                          </button>
                          <button
                            id={`${idPrefix}_r${rowIndex}_cancel`}
                            className="pp_iconBtn"
                            title="Cancel"
                            onClick={cancelEdit}
                          >
                            <IconX size={16} />
                          </button>
                          {onEdit && onDelete && (
                            <span
                              id={`${idPrefix}_r${rowIndex}_deleteSpacer`}
                              className="pp_actionSpacer"
                              aria-hidden="true"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          {row.editable && onEdit ? (
                            <button
                              id={`${idPrefix}_r${rowIndex}_edit`}
                              className="pp_iconBtn"
                              title="Edit"
                              onClick={() => startEdit(row)}
                              disabled={!!editingKey}
                            >
                              <IconEdit size={16} />
                            </button>
                          ) : (
                            onEdit && (
                              <span
                                id={`${idPrefix}_r${rowIndex}_editSpacer`}
                                className="pp_actionSpacer"
                                aria-hidden="true"
                              />
                            )
                          )}
                          <button
                            id={`${idPrefix}_r${rowIndex}_copy`}
                            className="pp_iconBtn"
                            title="Copy reference"
                            onClick={() => void onCopyRef(row.name)}
                          >
                            <IconCopy size={16} />
                          </button>
                          {row.deletable && onDelete ? (
                            <button
                              id={`${idPrefix}_r${rowIndex}_delete`}
                              className="pp_iconBtn pp_iconBtnDanger"
                              title="Delete"
                              onClick={() => void onDelete(row.name)}
                              disabled={!!editingKey}
                            >
                              <IconTrash size={16} />
                            </button>
                          ) : (
                            onDelete && (
                              <span
                                id={`${idPrefix}_r${rowIndex}_deleteSpacer`}
                                className="pp_actionSpacer"
                                aria-hidden="true"
                              />
                            )
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredSorted.length === 0 && editingKey !== NEW_KEY && (
              <tr>
                <td colSpan={colSpan} className="pp_emptyCell">
                  <EmptyState
                    id={`${idPrefix}_empty`}
                    title={search ? 'No matches' : emptyTitle}
                    message={search ? `Nothing matches "${search}".` : emptyMessage}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
