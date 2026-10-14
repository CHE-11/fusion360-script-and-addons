import { useCallback, useEffect, useState } from 'react';

import { IconRefresh, IconUpload } from '@tabler/icons-react';

import { onEvent, request } from '../../connector/fusionBridge';
import type { GlobalParam, PushResult } from '../../types/types';
import { sanitizeName } from '../../utils/sanitizeName';
import { ParamTable, type DraftRow, type TableColumn, type TableRow } from '../ParamTable/ParamTable';
import { useToast } from '../common/Toast';

const COLUMNS: TableColumn[] = ['name', 'expression', 'unit', 'comment', 'category', 'ref'];

function toRows(params: GlobalParam[]): TableRow[] {
  return params.map((p) => ({
    name: p.name,
    expression: p.expression,
    unit: p.unit ?? '',
    comment: p.comment ?? '',
    category: p.category ?? '',
    editable: true,
    deletable: true,
  }));
}

function draftToParam(draft: DraftRow): GlobalParam {
  return {
    name: draft.name.trim(),
    expression: draft.expression.trim(),
    unit: draft.unit.trim(),
    comment: draft.comment.trim(),
    category: draft.category.trim(),
  };
}

export function GlobalTab() {
  const { showToast } = useToast();
  const [params, setParams] = useState<GlobalParam[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await request<GlobalParam[]>('global:list');
      setParams(data ?? []);
    } catch (e) {
      showToast(`Failed to load global parameters: ${String(e)}`, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    void load();
    // Refresh when the backend pushes a change (e.g. the file changed on disk).
    const off = onEvent('loadGlobal', (raw) => {
      try {
        setParams(JSON.parse(raw) as GlobalParam[]);
      } catch {
        /* ignore malformed push */
      }
    });
    return off;
  }, [load]);

  const persist = useCallback(
    async (next: GlobalParam[]) => {
      const saved = await request<GlobalParam[]>('global:save', { params: next });
      setParams(saved ?? next);
    },
    []
  );

  const onAdd = useCallback(
    async (draft: DraftRow) => {
      const p = draftToParam(draft);
      if (!p.name || !p.expression) {
        showToast('Name and expression are required.', 'error');
        throw new Error('validation');
      }
      if (params.some((x) => x.name === p.name)) {
        showToast(`A global parameter named "${p.name}" already exists.`, 'error');
        throw new Error('duplicate');
      }
      try {
        await persist([...params, p]);
        showToast(`Added "${p.name}".`, 'success');
      } catch (e) {
        showToast(`Save failed: ${String(e)}`, 'error');
        throw e;
      }
    },
    [params, persist, showToast]
  );

  const onEdit = useCallback(
    async (originalName: string, draft: DraftRow) => {
      const p = draftToParam(draft);
      if (!p.name || !p.expression) {
        showToast('Name and expression are required.', 'error');
        throw new Error('validation');
      }
      if (p.name !== originalName && params.some((x) => x.name === p.name)) {
        showToast(`A global parameter named "${p.name}" already exists.`, 'error');
        throw new Error('duplicate');
      }
      try {
        await persist(params.map((x) => (x.name === originalName ? p : x)));
        showToast(`Updated "${p.name}".`, 'success');
      } catch (e) {
        showToast(`Save failed: ${String(e)}`, 'error');
        throw e;
      }
    },
    [params, persist, showToast]
  );

  const onDelete = useCallback(
    async (name: string) => {
      try {
        await persist(params.filter((x) => x.name !== name));
        showToast(`Deleted "${name}".`, 'success');
      } catch (e) {
        showToast(`Delete failed: ${String(e)}`, 'error');
      }
    },
    [params, persist, showToast]
  );

  const pushToDesign = useCallback(async () => {
    setBusy(true);
    try {
      const result = await request<PushResult>('global:pushToDesign', {});
      const { created, updated, errors } = result;
      if (errors.length) {
        showToast(`Pushed with ${errors.length} error(s): ${errors[0]}`, 'error');
      } else {
        showToast(`Pushed to design (${created} created, ${updated} updated).`, 'success');
      }
    } catch (e) {
      showToast(`Push failed: ${String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  return (
    <div id="pp_globalTab" className="pp_tabPanel">
      <ParamTable
        idPrefix="pp_global"
        rows={toRows(params)}
        columns={COLUMNS}
        editableFields={['name', 'expression', 'unit', 'comment', 'category']}
        canAdd
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        refName={(name) => `{{${sanitizeName(name)}}}`}
        busy={busy}
        emptyTitle="No global parameters"
        emptyMessage="Add app-wide parameters here, then push them into any open design."
        toolbarRight={
          <>
            <button className="pp_btn" title="Reload" onClick={() => void load()} disabled={busy}>
              <IconRefresh size={16} />
            </button>
            <button
              id="pp_global_pushBtn"
              className="pp_btn"
              title="Create/update these parameters in the active design"
              onClick={() => void pushToDesign()}
              disabled={busy || params.length === 0}
            >
              <IconUpload size={16} />
              Push to design
            </button>
          </>
        }
      />
    </div>
  );
}
