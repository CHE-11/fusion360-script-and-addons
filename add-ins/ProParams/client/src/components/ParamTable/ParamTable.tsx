import { useCallback, useMemo, useState, type ReactNode } from 'react';

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

import { copyToClipboard } from '../../utils/clipboard';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

export type TableColumn = 'name' | 'expression' | 'value' | 'unit' | 'comment' | 'category' | 'ref';

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
  ref: 'Ref',
};

const COLUMN_TO_FIELD: Partial<Record<TableColumn, DraftField>> = {
  name: 'name',
  expression: 'expression',
  unit: 'unit',
  comment: 'comment',
  category: 'category',
};

const NEW_KEY = '__new__';

const emptyDraft = (): DraftRow => ({ name: '', expression: '', unit: '', comment: '', category: '' });

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

  const toggleSort = useCallback(
    (col: TableColumn) => {
      if (col === 'ref') return;
      setSortCol((prevCol) => {
        if (prevCol === col) {
          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          return prevCol;
        }
        setSortDir('asc');
        return col;
      });
    },
    []
  );

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

  const startAdd = useCallback(() => {
    setDraft(emptyDraft());
    setEditingKey(NEW_KEY);
  }, []);

  const startEdit = useCallback((row: TableRow) => {
    setDraft({
      name: row.name,
      expression: row.expression,
      unit: row.unit ?? '',
      comment: row.comment ?? '',
      category: row.category ?? '',
    });
    setEditingKey(row.name);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setDraft(emptyDraft());
  }, []);

  const commit = useCallback(async () => {
    try {
      if (editingKey === NEW_KEY) {
        await onAdd?.(draft);
      } else if (editingKey) {
        await onEdit?.(editingKey, draft);
      }
      setEditingKey(null);
      setDraft(emptyDraft());
    } catch {
      // Callback is responsible for surfacing the error; keep the editor open.
    }
  }, [editingKey, draft, onAdd, onEdit]);

  const onCopyRef = useCallback(
    async (name: string) => {
      const copied = await copyToClipboard(refName(name));
      if (copied) {
        showToast('Copied', 'success');
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
      return (
        <input
          id={`${idPrefix}_draft_${field}`}
          className="pp_input pp_inputInline"
          value={draft[field]}
          placeholder={COLUMN_LABELS[col]}
          onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') cancelEdit();
          }}
        />
      );
    }
    if (row) return renderDisplayCell(col, row);
    return <span className="pp_muted">-</span>;
  };

  const renderDisplayCell = (col: TableColumn, row: TableRow) => {
    switch (col) {
      case 'ref':
        return (
          <code
            className="pp_ref"
            title="Click to copy reference"
            onClick={() => void onCopyRef(row.name)}
          >
            {refName(row.name)}
          </code>
        );
      case 'name':
        return <span className="pp_cellName">{row.name}</span>;
      case 'expression':
        return <span className="pp_cellMono">{row.expression}</span>;
      case 'value':
        return <span className="pp_cellMono pp_muted">{row.value ?? ''}</span>;
      case 'unit':
        return <span>{row.unit ?? ''}</span>;
      case 'comment':
        return <span className="pp_muted">{row.comment ?? ''}</span>;
      case 'category':
        return row.category ? <span className="pp_tag">{row.category}</span> : <span className="pp_muted">-</span>;
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
                <th
                  key={col}
                  className={col === 'ref' ? '' : 'pp_sortable'}
                  onClick={() => toggleSort(col)}
                >
                  <span className="pp_thContent">
                    {COLUMN_LABELS[col]}
                    {col !== 'ref' &&
                      (sortCol === col ? (
                        sortDir === 'asc' ? (
                          <IconSortAscending size={14} />
                        ) : (
                          <IconSortDescending size={14} />
                        )
                      ) : (
                        <IconSelector size={14} className="pp_muted" />
                      ))}
                  </span>
                </th>
              ))}
              <th className="pp_actionsCol">Actions</th>
            </tr>
          </thead>
          <tbody>
            {editingKey === NEW_KEY && (
              <tr className="pp_editRow">
                {columns.map((col) => (
                  <td key={col}>{renderEditableCell(col)}</td>
                ))}
                <td>
                  <div className="pp_actions">
                    <button className="pp_iconBtn pp_iconBtnOk" title="Save" onClick={() => void commit()}>
                      <IconCheck size={16} />
                    </button>
                    <button className="pp_iconBtn" title="Cancel" onClick={cancelEdit}>
                      <IconX size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filteredSorted.map((row) => {
              const isEditing = editingKey === row.name;
              return (
                <tr key={row.name} className={isEditing ? 'pp_editRow' : ''}>
                  {columns.map((col) => (
                    <td key={col}>{isEditing ? renderEditableCell(col, row) : renderDisplayCell(col, row)}</td>
                  ))}
                  <td>
                    <div className="pp_actions">
                      {isEditing ? (
                        <>
                          <button className="pp_iconBtn pp_iconBtnOk" title="Save" onClick={() => void commit()}>
                            <IconCheck size={16} />
                          </button>
                          <button className="pp_iconBtn" title="Cancel" onClick={cancelEdit}>
                            <IconX size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          {row.editable && onEdit && (
                            <button
                              className="pp_iconBtn"
                              title="Edit"
                              onClick={() => startEdit(row)}
                              disabled={!!editingKey}
                            >
                              <IconEdit size={16} />
                            </button>
                          )}
                          <button
                            className="pp_iconBtn"
                            title="Copy reference"
                            onClick={() => void onCopyRef(row.name)}
                          >
                            <IconCopy size={16} />
                          </button>
                          {row.deletable && onDelete && (
                            <button
                              className="pp_iconBtn pp_iconBtnDanger"
                              title="Delete"
                              onClick={() => void onDelete(row.name)}
                              disabled={!!editingKey}
                            >
                              <IconTrash size={16} />
                            </button>
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
