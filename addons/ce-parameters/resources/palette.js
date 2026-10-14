'use strict';

var COLUMNS = ['name', 'expression', 'value', 'unit', 'comment', 'object'];
var HINT = 'Click a name to copy it. Double-click a cell to edit. Type in the last row to add a user parameter.';
var UNITS = [
  ['mm', 'mm'],
  ['cm', 'cm'],
  ['m', 'm'],
  ['in', 'in'],
  ['ft', 'ft'],
  ['deg', 'deg'],
  ['rad', 'rad'],
  ['', 'unitless'],
  ['Text', 'Text']
];

var activeTab = 'all';
var snapshot = null;
var shownVersion = 0;
var received = false;
var statusIsError = false;
var statusTimer = null;
var pendingAdd = false;
var unitsChosen = false;
var selection = null;
var editing = null;
var suppressBlur = false;
var pendingSelection = null;
var grid = [];
var draft = { name: '', expression: '', units: 'mm', comment: '' };

function el(tag, id, className) {
  var node = document.createElement(tag);
  if (id) {
    node.id = id;
  }
  if (className) {
    node.className = className;
  }
  return node;
}

function setStatus(message, isError) {
  var status = document.getElementById('status-message');
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  status.textContent = message || '';
  status.className = isError ? 'is-error' : (message && message !== HINT ? 'is-success' : '');
  statusIsError = !!isError;
  if (!isError && message && message !== HINT) {
    statusTimer = setTimeout(function () {
      statusTimer = null;
      if (!statusIsError) {
        status.textContent = HINT;
        status.className = '';
      }
    }, 1600);
  }
}

function showEditError(data) {
  if (data && data.editError) {
    setStatus(data.editError, true);
  } else if (statusIsError) {
    setStatus(HINT, false);
  }
}

function send(action, payload) {
  if (!window.adsk || !window.adsk.fusionSendData) {
    setStatus('This window is not connected to Fusion.', true);
    return;
  }
  window.adsk.fusionSendData(action, JSON.stringify(payload || {}));
}

function notifyReady() {
  if (received) {
    return;
  }
  send('ready', {});
  setTimeout(notifyReady, 300);
}

function addRowFocused() {
  var active = document.activeElement;
  return !!(active && active.dataset && active.dataset.row === '__add__');
}

function onUpdate(data) {
  if (typeof data.version === 'number' && data.version < shownVersion) {
    return;
  }
  if (typeof data.version === 'number') {
    shownVersion = data.version;
  }
  snapshot = data;
  received = true;
  applyDefaultUnit(data);
  if (pendingAdd) {
    if (!data.editError) {
      draft.name = '';
      draft.expression = '';
      draft.comment = '';
      clearAddInputs();
    }
    pendingAdd = false;
  }
  var design = document.getElementById('design-name');
  if (design) {
    design.textContent = data.designName || '';
  }
  if (editing || addRowFocused()) {
    showEditError(data);
    return;
  }
  render();
  showEditError(data);
}

function clearAddInputs() {
  ['add-name', 'add-expression', 'add-comment'].forEach(function (id) {
    var input = document.getElementById(id);
    if (input) {
      input.value = '';
    }
  });
}

function applyDefaultUnit(data) {
  if (unitsChosen || !data || !data.defaultLengthUnit) {
    return;
  }
  draft.units = data.defaultLengthUnit;
  var select = document.getElementById('add-units');
  if (select) {
    select.value = draft.units;
  }
}

function updateTabs() {
  document.getElementById('tab-selected').setAttribute('aria-selected', activeTab === 'selected' ? 'true' : 'false');
  document.getElementById('tab-all').setAttribute('aria-selected', activeTab === 'all' ? 'true' : 'false');
}

function queryText() {
  return (document.getElementById('search-input').value || '').trim().toLowerCase();
}

function objectLabel(parent, name) {
  if (parent && name && parent !== name) {
    return parent + ' · ' + name;
  }
  return name || parent || '';
}

function matches(parameter, objectName, sectionTitle) {
  var query = queryText();
  if (!query) {
    return true;
  }
  var haystack = [
    parameter.name,
    parameter.expression,
    parameter.comment,
    parameter.role,
    parameter.value,
    parameter.unit,
    objectName,
    sectionTitle
  ].join(' ').toLowerCase();
  return haystack.indexOf(query) !== -1;
}

function parameterRow(parameter, objectName) {
  return {
    type: 'param',
    id: parameter.name,
    parameter: parameter,
    objectName: objectName
  };
}

function pushSection(sections, title, rows) {
  var kept = rows.filter(function (row) {
    return matches(row.parameter, row.objectName, title);
  });
  if (kept.length) {
    sections.push({ title: title, rows: kept });
  }
}

function buildSections() {
  var sections = [];
  var messages = [];
  if (!snapshot) {
    messages.push('Loading parameters…');
  } else if (snapshot.error) {
    messages.push(snapshot.error);
  } else if (activeTab === 'selected') {
    if (snapshot.emptySelection) {
      messages.push('Select a body, component, sketch, or feature.');
    } else {
      (snapshot.selections || []).forEach(function (section) {
        var rows = [];
        (section.userParameters || []).forEach(function (parameter) {
          rows.push(parameterRow(parameter, 'User parameter'));
        });
        (section.objects || []).forEach(function (object) {
          (object.parameters || []).forEach(function (parameter) {
            rows.push(parameterRow(parameter, objectLabel(section.title, object.name)));
          });
        });
        if (!rows.length && section.message && !queryText()) {
          sections.push({ title: section.title || 'Selection', rows: [], message: section.message });
        } else {
          pushSection(sections, section.title || 'Selection', rows);
        }
      });
    }
  } else {
    pushSection(sections, 'User Parameters', (snapshot.userParameters || []).map(function (parameter) {
      return parameterRow(parameter, 'User parameter');
    }));
    (snapshot.components || []).forEach(function (component) {
      var rows = [];
      (component.objects || []).forEach(function (object) {
        (object.parameters || []).forEach(function (parameter) {
          rows.push(parameterRow(parameter, objectLabel(component.name, object.name)));
        });
      });
      pushSection(sections, component.name, rows);
    });
  }
  var shown = sections.some(function (section) {
    return section.rows && section.rows.length;
  });
  if (snapshot && !snapshot.error && !messages.length && !shown) {
    if (queryText()) {
      messages.push('No parameters match your filter.');
    } else if (activeTab === 'all') {
      messages.push('This design has no parameters.');
    } else {
      messages.push('Nothing to show for this selection.');
    }
  }
  sections.push({ title: 'New user parameter', rows: [], add: true });
  return { sections: sections, messages: messages };
}

function cellText(row, col) {
  if (row.type !== 'param') {
    return '';
  }
  if (col === 'object') {
    return row.objectName || '';
  }
  return row.parameter[col] || '';
}

function isEditable(row, col) {
  if (!row || row.type !== 'param') {
    return false;
  }
  return col === 'expression' || col === 'comment';
}

function findCell(rowId, col) {
  var cells = document.querySelectorAll('#parameter-body td[data-col]');
  for (var index = 0; index < cells.length; index += 1) {
    if (cells[index].dataset.row === rowId && cells[index].dataset.col === col) {
      return cells[index];
    }
  }
  return null;
}

function gridIndex(rowId) {
  for (var index = 0; index < grid.length; index += 1) {
    if (grid[index].id === rowId) {
      return index;
    }
  }
  return -1;
}

function moveSelection(rowDelta, colDelta) {
  if (!selection || !grid.length) {
    return;
  }
  var rowIndex = gridIndex(selection.id);
  var colIndex = COLUMNS.indexOf(selection.col);
  if (rowIndex < 0) {
    rowIndex = 0;
  }
  if (colIndex < 0) {
    colIndex = 0;
  }
  rowIndex = Math.max(0, Math.min(grid.length - 1, rowIndex + rowDelta));
  colIndex = Math.max(0, Math.min(COLUMNS.length - 1, colIndex + colDelta));
  selection = { id: grid[rowIndex].id, col: COLUMNS[colIndex] };
  markSelection();
}

function markSelection() {
  var selected = document.querySelectorAll('#parameter-body td.is-selected, #parameter-body tr.is-active-row');
  for (var index = 0; index < selected.length; index += 1) {
    selected[index].classList.remove('is-selected');
    selected[index].classList.remove('is-active-row');
  }
  if (!selection) {
    return;
  }
  var cell = findCell(selection.id, selection.col);
  if (!cell) {
    return;
  }
  cell.classList.add('is-selected');
  if (cell.parentNode) {
    cell.parentNode.classList.add('is-active-row');
  }
  try {
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch (error) {
    try {
      cell.scrollIntoView(false);
    } catch (ignored) {
      ignored = null;
    }
  }
}

function focusSheet() {
  var sheet = document.getElementById('sheet-scroll');
  try {
    sheet.focus({ preventScroll: true });
  } catch (error) {
    sheet.focus();
  }
}

function render() {
  updateTabs();
  var body = document.getElementById('parameter-body');
  var sheet = document.getElementById('sheet-scroll');
  var scroll = sheet.scrollTop;
  var built = buildSections();
  var editor = null;
  var serial = 0;
  var alt = false;
  grid = [];
  body.textContent = '';

  built.messages.forEach(function (message, index) {
    var row = el('tr', 'message-row-' + index, 'message-row');
    var cell = el('td', 'message-cell-' + index, 'message-cell');
    cell.colSpan = 7;
    cell.textContent = message;
    row.appendChild(cell);
    body.appendChild(row);
  });

  built.sections.forEach(function (section, sectionIndex) {
    if (section.title) {
      var group = el('tr', 'group-row-' + sectionIndex, 'group-row');
      var groupCell = el('td', 'group-cell-' + sectionIndex, 'group-cell');
      groupCell.colSpan = 7;
      groupCell.textContent = section.title;
      group.appendChild(groupCell);
      body.appendChild(group);
    }
    if (section.message) {
      var note = el('tr', 'section-note-' + sectionIndex, 'message-row');
      var noteCell = el('td', 'section-note-cell-' + sectionIndex, 'message-cell');
      noteCell.colSpan = 7;
      noteCell.textContent = section.message;
      note.appendChild(noteCell);
      body.appendChild(note);
    }
    section.rows.forEach(function (row) {
      serial += 1;
      alt = !alt;
      grid.push(row);
      var tr = el('tr', 'sheet-row-' + serial, 'param-row' + (alt ? ' is-alt' : ''));
      if (selection && selection.id === row.id) {
        tr.classList.add('is-active-row');
      }
      tr.appendChild(gutterCell(row, serial));
      COLUMNS.forEach(function (col) {
        var made = dataCell(row, col, serial);
        tr.appendChild(made.cell);
        if (made.editor) {
          editor = made.editor;
        }
      });
      body.appendChild(tr);
    });
    if (section.add) {
      serial += 1;
      grid.push({ type: 'add', id: '__add__' });
      body.appendChild(addRow(serial));
    }
  });

  sheet.scrollTop = scroll;
  if (editor) {
    editor.focus();
    if (editing && editing.initial != null) {
      var end = editor.value.length;
      editor.setSelectionRange(end, end);
    } else if (editor.select) {
      editor.select();
    }
  } else {
    markSelection();
  }
}

function gutterCell(row, serial) {
  var td = el('td', 'gutter-' + serial, 'gutter-cell');
  var index = el('span', 'row-index-' + serial, 'row-index');
  index.textContent = String(serial);
  td.appendChild(index);
  if (row.parameter && row.parameter.canDelete) {
    var remove = el('button', 'row-delete-' + serial, 'row-delete');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Delete ' + row.parameter.name;
    remove.dataset.action = 'delete';
    remove.dataset.row = row.id;
    td.appendChild(remove);
  }
  return td;
}

function dataCell(row, col, serial) {
  var td = el('td', 'cell-' + serial + '-' + col);
  td.dataset.row = row.id;
  td.dataset.col = col;
  if (selection && selection.id === row.id && selection.col === col) {
    td.classList.add('is-selected');
  }
  var text = cellText(row, col);
  td.title = text;
  if (editing && editing.id === row.id && editing.col === col) {
    var input = el('input', 'editor-' + serial + '-' + col, 'cell-editor');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = editing.initial != null ? editing.initial : text;
    input.dataset.original = text;
    input.dataset.row = row.id;
    input.dataset.col = col;
    input.addEventListener('keydown', onEditorKeydown);
    input.addEventListener('blur', onEditorBlur);
    td.appendChild(input);
    return { cell: td, editor: input };
  }
  var span = el('span', 'cell-text-' + serial + '-' + col, 'cell-text');
  span.textContent = text;
  td.appendChild(span);
  return { cell: td, editor: null };
}

function addRow(serial) {
  var tr = el('tr', 'add-row', 'add-row' + (selection && selection.id === '__add__' ? ' is-active-row' : ''));
  var gutter = el('td', 'gutter-add', 'gutter-cell');
  var index = el('span', 'row-index-add', 'row-index');
  index.textContent = String(serial);
  gutter.appendChild(index);
  tr.appendChild(gutter);
  tr.appendChild(addInputCell('name', 'add-name', 'Name', draft.name));
  tr.appendChild(addInputCell('expression', 'add-expression', 'Expression', draft.expression));
  var value = el('td', 'cell-add-value');
  value.dataset.row = '__add__';
  value.dataset.col = 'value';
  tr.appendChild(value);
  tr.appendChild(addUnitCell());
  tr.appendChild(addInputCell('comment', 'add-comment', 'Comment', draft.comment));
  var objectCell = el('td', 'cell-add-object');
  objectCell.dataset.row = '__add__';
  objectCell.dataset.col = 'object';
  var objectText = el('span', 'cell-text-add-object', 'cell-text');
  objectText.textContent = 'User parameter';
  objectCell.appendChild(objectText);
  tr.appendChild(objectCell);
  return tr;
}

function addInputCell(col, id, placeholder, value) {
  var td = el('td', 'cell-add-' + col);
  td.dataset.row = '__add__';
  td.dataset.col = col;
  if (selection && selection.id === '__add__' && selection.col === col) {
    td.classList.add('is-selected');
  }
  var input = el('input', id, 'add-input');
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.placeholder = placeholder;
  input.value = value || '';
  input.dataset.row = '__add__';
  input.dataset.col = col;
  input.addEventListener('input', function () {
    draft[col] = input.value;
  });
  input.addEventListener('keydown', onAddKeydown);
  input.addEventListener('focus', function () {
    selection = { id: '__add__', col: col };
    markSelection();
  });
  input.addEventListener('blur', onAddBlur);
  td.appendChild(input);
  return td;
}

function addUnitCell() {
  var td = el('td', 'cell-add-unit');
  td.dataset.row = '__add__';
  td.dataset.col = 'unit';
  if (selection && selection.id === '__add__' && selection.col === 'unit') {
    td.classList.add('is-selected');
  }
  var select = el('select', 'add-units', 'add-input');
  select.dataset.row = '__add__';
  select.dataset.col = 'unit';
  UNITS.forEach(function (pair, index) {
    var option = el('option', 'unit-option-' + index);
    option.value = pair[0];
    option.textContent = pair[1];
    select.appendChild(option);
  });
  select.value = draft.units;
  select.addEventListener('change', function () {
    unitsChosen = true;
    draft.units = select.value;
  });
  select.addEventListener('keydown', onAddKeydown);
  select.addEventListener('focus', function () {
    selection = { id: '__add__', col: 'unit' };
    markSelection();
  });
  select.addEventListener('blur', onAddBlur);
  td.appendChild(select);
  return td;
}

function onAddKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitAdd();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    draft.name = '';
    draft.expression = '';
    draft.comment = '';
    render();
    focusSheet();
    return;
  }
  if (event.key === 'Tab' && event.target.id === 'add-comment' && !event.shiftKey) {
    event.preventDefault();
    document.getElementById('add-name').focus();
  } else if (event.key === 'Tab' && event.target.id === 'add-name' && event.shiftKey) {
    event.preventDefault();
    document.getElementById('add-comment').focus();
  }
}

function onAddBlur() {
  setTimeout(function () {
    if (addRowFocused() || pendingAdd) {
      return;
    }
    commitAdd();
  }, 0);
}

function commitAdd() {
  if (pendingAdd) {
    return;
  }
  var name = (draft.name || '').trim();
  var expression = (draft.expression || '').trim();
  if (!name && !expression && !(draft.comment || '').trim()) {
    return;
  }
  if (!name || !expression) {
    setStatus('Enter a name and an expression to add a parameter.', true);
    return;
  }
  pendingAdd = true;
  send('add', {
    name: name,
    expression: expression,
    units: draft.units,
    comment: draft.comment || ''
  });
}

function beginEdit(rowId, col, initial) {
  var row = grid[gridIndex(rowId)];
  if (!isEditable(row, col)) {
    return;
  }
  selection = { id: rowId, col: col };
  editing = { id: rowId, col: col, initial: initial == null ? null : initial };
  render();
}

function closeEditor(next) {
  if (!editing) {
    if (next) {
      selection = next;
      markSelection();
    }
    return;
  }
  var input = document.querySelector('.cell-editor');
  var original = input ? input.dataset.original : '';
  var nextValue = input ? input.value : original;
  var changed = input && (editing.col === 'expression' ? nextValue.trim() : nextValue) !== original;
  var field = editing.col;
  var payload = { name: editing.id };
  if (changed) {
    payload[field] = field === 'expression' ? nextValue.trim() : nextValue;
  }
  suppressBlur = true;
  editing = null;
  if (next) {
    selection = next;
  }
  if (changed) {
    rememberEdit(payload.name, field, payload[field]);
    send('edit', payload);
  }
  render();
  suppressBlur = false;
  focusSheet();
}

function neighbor(rowDelta, colDelta) {
  if (!selection || !grid.length) {
    return null;
  }
  var rowIndex = gridIndex(selection.id);
  var colIndex = COLUMNS.indexOf(selection.col);
  if (rowIndex < 0) {
    rowIndex = 0;
  }
  rowIndex = Math.max(0, Math.min(grid.length - 1, rowIndex + rowDelta));
  colIndex = Math.max(0, Math.min(COLUMNS.length - 1, colIndex + colDelta));
  return { id: grid[rowIndex].id, col: COLUMNS[colIndex] };
}

function onEditorKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    closeEditor(neighbor(1, 0));
  } else if (event.key === 'Tab') {
    event.preventDefault();
    closeEditor(neighbor(0, event.shiftKey ? -1 : 1));
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (event.target) {
      event.target.value = event.target.dataset.original;
    }
    closeEditor(null);
  }
}

function onEditorBlur() {
  if (suppressBlur) {
    return;
  }
  var next = pendingSelection;
  pendingSelection = null;
  setTimeout(function () {
    if (suppressBlur || !editing) {
      return;
    }
    closeEditor(next);
  }, 0);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () {
      return copyWithTextarea(text);
    });
  }
  return copyWithTextarea(text);
}

function copyWithTextarea(text) {
  return new Promise(function (resolve, reject) {
    var area = document.createElement('textarea');
    area.id = 'clipboard-fallback';
    area.value = text;
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (error) {
      ok = false;
    }
    area.remove();
    if (ok) {
      resolve();
    } else {
      reject(new Error('copy failed'));
    }
  });
}

function selectedText() {
  if (!selection) {
    return '';
  }
  if (selection.id === '__add__') {
    if (selection.col === 'name') {
      return draft.name || '';
    }
    if (selection.col === 'expression') {
      return draft.expression || '';
    }
    if (selection.col === 'comment') {
      return draft.comment || '';
    }
    if (selection.col === 'unit') {
      return draft.units || '';
    }
    return '';
  }
  var row = grid[gridIndex(selection.id)];
  if (!row || row.type !== 'param') {
    return '';
  }
  if (selection.col === 'name') {
    return row.parameter.name || '';
  }
  return cellText(row, selection.col);
}

function copySelection() {
  var text = selectedText();
  if (!text) {
    return;
  }
  copyText(text).then(function () {
    var cell = selection && findCell(selection.id, selection.col);
    if (cell) {
      cell.classList.add('is-copied');
      setTimeout(function () {
        cell.classList.remove('is-copied');
      }, 1200);
    }
    showCopyNotice(text);
  }).catch(function () {
    setStatus('Could not copy that cell.', true);
  });
}

function showCopyNotice(text) {
  var toast = document.getElementById('copy-toast');
  toast.textContent = 'Copied ' + text;
  toast.className = 'is-visible';
  setStatus('Copied ' + text, false);
  send('copied', { text: text });
  setTimeout(function () {
    if (toast.textContent === 'Copied ' + text) {
      toast.className = '';
    }
  }, 2000);
}

function deleteSelection() {
  if (!selection || selection.id === '__add__') {
    return;
  }
  var row = grid[gridIndex(selection.id)];
  if (!row || !row.parameter || !row.parameter.canDelete) {
    setStatus('Only user parameters that are not in use can be deleted.', true);
    return;
  }
  if (window.confirm('Delete user parameter ' + row.parameter.name + '?')) {
    send('delete', { name: row.parameter.name });
  }
}

function onSheetMouseDown(event) {
  var cell = event.target.closest ? event.target.closest('td[data-col]') : null;
  if (!cell || !editing) {
    return;
  }
  pendingSelection = { id: cell.dataset.row, col: cell.dataset.col };
}

function onSheetClick(event) {
  var remove = event.target.closest ? event.target.closest('[data-action="delete"]') : null;
  if (remove) {
    event.stopPropagation();
    selection = { id: remove.dataset.row, col: 'name' };
    deleteSelection();
    return;
  }
  var cell = event.target.closest ? event.target.closest('td[data-col]') : null;
  if (!cell) {
    return;
  }
  var rowId = cell.dataset.row;
  var col = cell.dataset.col;
  if (rowId === '__add__') {
    selection = { id: rowId, col: col };
    markSelection();
    var field = cell.querySelector('input, select');
    if (field && document.activeElement !== field) {
      field.focus();
    }
    return;
  }
  var same = selection && selection.id === rowId && selection.col === col;
  selection = { id: rowId, col: col };
  markSelection();
  focusSheet();
  if (col === 'name') {
    copySelection();
    return;
  }
  if (same && isEditable(grid[gridIndex(rowId)], col)) {
    beginEdit(rowId, col, null);
  }
}

function onSheetDblClick(event) {
  var cell = event.target.closest ? event.target.closest('td[data-col]') : null;
  if (!cell || cell.dataset.row === '__add__') {
    return;
  }
  beginEdit(cell.dataset.row, cell.dataset.col, null);
}

function onSheetKeydown(event) {
  var target = event.target;
  if (event.key === 'Escape') {
    if (target && (target.classList.contains('cell-editor') || target.classList.contains('add-input'))) {
      return;
    }
    if (target && target.id === 'search-input' && target.value) {
      event.preventDefault();
      target.value = '';
      render();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (target && (target.id === 'search-input' || target.classList.contains('cell-editor') || target.classList.contains('add-input'))) {
    return;
  }
  if (!selection) {
    if (grid.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')) {
      selection = { id: grid[0].id, col: 'name' };
      markSelection();
      event.preventDefault();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    event.preventDefault();
    copySelection();
    return;
  }
  if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault();
    if (selection.id === '__add__') {
      var field = findCell('__add__', selection.col);
      var input = field && field.querySelector('input, select');
      if (input) {
        input.focus();
      }
      return;
    }
    beginEdit(selection.id, selection.col, null);
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    clearSelectedCell();
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(-1, 0);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveSelection(1, 0);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    moveSelection(0, -1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    moveSelection(0, 1);
  } else if (event.key === 'Tab') {
    event.preventDefault();
    moveSelection(0, event.shiftKey ? -1 : 1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    selection.col = 'name';
    markSelection();
  } else if (event.key === 'End') {
    event.preventDefault();
    selection.col = 'object';
    markSelection();
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (selection.id !== '__add__' && isEditable(grid[gridIndex(selection.id)], selection.col)) {
      event.preventDefault();
      beginEdit(selection.id, selection.col, event.key);
    }
  }
}

function rememberEdit(name, field, value) {
  if (!snapshot) {
    return;
  }
  function touch(list) {
    (list || []).forEach(function (parameter) {
      if (parameter && parameter.name === name) {
        parameter[field] = value;
      }
    });
  }
  touch(snapshot.userParameters);
  (snapshot.selections || []).forEach(function (section) {
    touch(section.userParameters);
    (section.objects || []).forEach(function (object) {
      touch(object.parameters);
    });
  });
  (snapshot.components || []).forEach(function (component) {
    (component.objects || []).forEach(function (object) {
      touch(object.parameters);
    });
  });
}

function clearSelectedCell() {
  if (!selection || selection.id === '__add__') {
    return;
  }
  var row = grid[gridIndex(selection.id)];
  if (!row || row.type !== 'param') {
    return;
  }
  if (selection.col === 'comment') {
    rememberEdit(row.parameter.name, 'comment', '');
    send('edit', { name: row.parameter.name, comment: '' });
    render();
    return;
  }
  if (selection.col === 'expression') {
    setStatus('An expression cannot be blank.', true);
  }
}

function bindStatic() {
  var body = document.getElementById('parameter-body');
  body.addEventListener('mousedown', onSheetMouseDown);
  body.addEventListener('click', onSheetClick);
  body.addEventListener('dblclick', onSheetDblClick);
  document.addEventListener('keydown', onSheetKeydown);
  document.getElementById('refresh-button').addEventListener('click', function () {
    send('refresh', {});
  });
  document.getElementById('search-input').addEventListener('input', function () {
    if (!editing && !addRowFocused()) {
      render();
    }
  });
  document.getElementById('tab-selected').addEventListener('click', function () {
    activeTab = 'selected';
    selection = null;
    render();
  });
  document.getElementById('tab-all').addEventListener('click', function () {
    activeTab = 'all';
    selection = null;
    render();
  });
  updateTabs();
  render();
}

window.fusionJavaScriptHandler = {
  handle: function (action, data) {
    try {
      if (action === 'update') {
        onUpdate(JSON.parse(data));
      }
      return 'ok';
    } catch (error) {
      return 'error';
    }
  }
};

document.addEventListener('DOMContentLoaded', function () {
  bindStatic();
  notifyReady();
});
