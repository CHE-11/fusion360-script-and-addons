import { useCallback, useEffect, useState } from 'react';

import { IconClick, IconCursorText, IconRefresh } from '@tabler/icons-react';

import { onEvent, request } from '../../connector/fusionBridge';
import type { FeatureParam, FeatureSelection } from '../../types/types';
import { sanitizeName } from '../../utils/sanitizeName';
import { ParamTable, type DraftRow, type TableColumn, type TableRow } from '../ParamTable/ParamTable';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

const COLUMNS: TableColumn[] = ['name', 'expression', 'value', 'unit', 'comment', 'ref'];

const EMPTY_SELECTION: FeatureSelection = { hasSelection: false, params: [] };

function toRows(params: FeatureParam[]): TableRow[] {
  return params.map((p) => ({
    name: p.name,
    expression: p.expression,
    value: p.value ?? '',
    unit: p.unit ?? '',
    comment: p.comment ?? '',
    editable: true,
    deletable: true,
  }));
}

export function FeatureTab() {
  const { showToast } = useToast();
  const [selection, setSelection] = useState<FeatureSelection>(EMPTY_SELECTION);
  const [busy, setBusy] = useState(false);

  const readSelection = useCallback(
    async (announce = false) => {
      setBusy(true);
      try {
        const data = await request<FeatureSelection>('feature:readSelection');
        setSelection(data ?? EMPTY_SELECTION);
        if (announce) {
          showToast(
            data?.hasSelection ? `Reading ${data.entity?.label ?? 'selection'}` : 'Nothing is selected.',
            data?.hasSelection ? 'success' : 'info'
          );
        }
      } catch (e) {
        showToast(`Failed to read selection: ${String(e)}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    void readSelection(false);
    // Clear selection when the active document changes.
    const off = onEvent('docActivated', () => setSelection(EMPTY_SELECTION));
    return off;
  }, [readSelection]);

  const onAdd = useCallback(
    async (draft: DraftRow) => {
      try {
        const data = await request<FeatureSelection>('feature:add', {
          name: draft.name.trim(),
          expression: draft.expression.trim(),
          unit: draft.unit.trim(),
          comment: draft.comment.trim(),
        });
        setSelection(data ?? EMPTY_SELECTION);
        showToast(`Added "${draft.name.trim()}" to selection.`, 'success');
      } catch (e) {
        showToast(String(e), 'error');
        throw e;
      }
    },
    [showToast]
  );

  const onEdit = useCallback(
    async (originalName: string, draft: DraftRow) => {
      try {
        const data = await request<FeatureSelection>('feature:update', {
          originalName,
          name: draft.name.trim(),
          expression: draft.expression.trim(),
          comment: draft.comment.trim(),
        });
        setSelection(data ?? EMPTY_SELECTION);
        showToast(`Updated "${draft.name.trim()}".`, 'success');
      } catch (e) {
        showToast(String(e), 'error');
        throw e;
      }
    },
    [showToast]
  );

  const onDelete = useCallback(
    async (name: string) => {
      try {
        const data = await request<FeatureSelection>('feature:delete', { name });
        setSelection(data ?? EMPTY_SELECTION);
        showToast(`Removed "${name}" from selection.`, 'success');
      } catch (e) {
        showToast(String(e), 'error');
      }
    },
    [showToast]
  );

  const readBtn = (
    <button
      id="pp_feature_readBtn"
      className="pp_btn pp_btnPrimary"
      onClick={() => void readSelection(true)}
      disabled={busy}
    >
      <IconCursorText size={16} />
      Read selection
    </button>
  );

  if (!selection.hasSelection) {
    return (
      <div id="pp_featureTab" className="pp_tabPanel">
        <EmptyState
          id="pp_feature_empty"
          icon={<IconClick size={40} />}
          title="Nothing selected"
          message="Select a face, edge, body, or sketch in the viewport, then read the selection to view and add parameters attached to it."
          action={readBtn}
        />
      </div>
    );
  }

  return (
    <div id="pp_featureTab" className="pp_tabPanel">
      <div className="pp_scopeBar" id="pp_feature_scope">
        <span className="pp_muted">Selected</span>
        <span className="pp_scopeName">{selection.entity?.label}</span>
        <button className="pp_iconBtn" title="Re-read selection" onClick={() => void readSelection(true)} disabled={busy}>
          <IconRefresh size={16} />
        </button>
      </div>
      <ParamTable
        idPrefix="pp_feature"
        rows={toRows(selection.params)}
        columns={COLUMNS}
        editableFields={['name', 'expression', 'unit', 'comment']}
        canAdd
        addLabel="Add feature parameter"
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        refName={(name) => `{{${sanitizeName(name)}}}`}
        busy={busy}
        emptyTitle="No parameters on this entity"
        emptyMessage="Add a parameter to attach it to the selected entity. It becomes a real design parameter that can drive geometry."
      />
    </div>
  );
}
