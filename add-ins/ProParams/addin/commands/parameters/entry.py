import json
import adsk.core, adsk.fusion
import os
import re
import csv
import threading
import time
import traceback
from ...lib import fusionAddInUtils as futil
from ... import config

app = adsk.core.Application.get()
ui = app.userInterface

CMD_ID = f'{config.COMPANY_NAME}_{config.ADDIN_NAME}_PalleteShow'
CMD_NAME = 'ProParams Manager'
CMD_Description = 'Manage Global, Project, and Feature parameters'
PALETTE_NAME = 'ProParams Manager'
IS_PROMOTED = True

PALETTE_ID = config.sample_palette_id
PALETTE_URL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', 'html', 'index.html')
PALETTE_URL = PALETTE_URL.replace('\\', '/')
PALETTE_DOCKING = adsk.core.PaletteDockingStates.PaletteDockStateRight

WORKSPACE_ID = 'FusionSolidEnvironment'
PANEL_ID = 'SolidScriptsAddinsPanel'
COMMAND_BESIDE_ID = 'ScriptsManagerCommand'
ICON_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', '')

# ---------------------------------------------------------------------------
# Data file locations
# ---------------------------------------------------------------------------
# Global store now lives in the user data dir (cross-document, app-wide).
DATA_FILE_GLOBAL = os.path.join(config.USER_DIR_PATH, 'ProParams_global.json')
# Legacy stores kept for one-time migration.
LEGACY_DATA_FILE_CSV = os.path.join(os.path.dirname(os.path.abspath(config.__file__)), 'ProParams_data.csv')
LEGACY_DATA_FILE_JSON = os.path.join(os.path.dirname(os.path.abspath(config.__file__)), 'ProParams_data.json')

# Attribute group used to associate user parameters with a selected entity.
FEATURE_ATTR_GROUP = 'ProParamsFeature'

WATCHER_EVENT_ID = f'{config.COMPANY_NAME}_{config.ADDIN_NAME}_FileWatcher'

local_handlers = []
watcher_thread = None
stop_watcher_event = threading.Event()
last_mtime = 0

# The entity captured by the most recent `feature:readSelection`, reused by the
# feature add/update/delete actions.
selected_feature_entity = None


# ===========================================================================
# Lifecycle
# ===========================================================================
def start():
    cmd_def = ui.commandDefinitions.addButtonDefinition(CMD_ID, CMD_NAME, CMD_Description, ICON_FOLDER)
    futil.add_handler(cmd_def.commandCreated, command_created)
    workspace = ui.workspaces.itemById(WORKSPACE_ID)
    panel = workspace.toolbarPanels.itemById(PANEL_ID)
    control = panel.controls.addCommand(cmd_def, COMMAND_BESIDE_ID, False)
    control.isPromoted = IS_PROMOTED

    # Register Custom Event for File Watcher (global store changes on disk).
    custom_event = app.registerCustomEvent(WATCHER_EVENT_ID)
    if custom_event:
        futil.add_handler(custom_event, on_global_file_changed)

    # React to document changes so the Project tab stays in sync.
    try:
        futil.add_handler(app.documentActivated, on_document_activated)
    except Exception:
        futil.log(f"Could not attach documentActivated handler: {traceback.format_exc()}")

    # Start Watcher Thread
    global watcher_thread, last_mtime
    stop_watcher_event.clear()

    if os.path.exists(DATA_FILE_GLOBAL):
        last_mtime = os.path.getmtime(DATA_FILE_GLOBAL)

    watcher_thread = threading.Thread(target=watch_loop)
    watcher_thread.daemon = True
    watcher_thread.start()


def stop():
    workspace = ui.workspaces.itemById(WORKSPACE_ID)
    panel = workspace.toolbarPanels.itemById(PANEL_ID)
    command_control = panel.controls.itemById(CMD_ID)
    command_definition = ui.commandDefinitions.itemById(CMD_ID)
    palette = ui.palettes.itemById(PALETTE_ID)
    if command_control: command_control.deleteMe()
    if command_definition: command_definition.deleteMe()
    if palette: palette.deleteMe()

    # Stop Watcher
    stop_watcher_event.set()
    try:
        app.unregisterCustomEvent(WATCHER_EVENT_ID)
    except Exception:
        pass


# ===========================================================================
# Global store file watcher
# ===========================================================================
def watch_loop():
    global last_mtime
    while not stop_watcher_event.is_set():
        if os.path.exists(DATA_FILE_GLOBAL):
            try:
                mtime = os.path.getmtime(DATA_FILE_GLOBAL)
                if last_mtime != 0 and mtime > last_mtime:
                    last_mtime = mtime
                    app.fireCustomEvent(WATCHER_EVENT_ID)
                elif last_mtime == 0:
                    last_mtime = mtime
            except Exception:
                pass
        time.sleep(1)


def on_global_file_changed(args):
    # Push the refreshed global store to the palette (if open).
    palette = ui.palettes.itemById(PALETTE_ID)
    if palette:
        try:
            palette.sendInfoToHTML('loadGlobal', json.dumps(load_global()))
        except Exception:
            futil.log(f"on_global_file_changed error: {traceback.format_exc()}")


def on_document_activated(args):
    # Selection does not survive a document change.
    global selected_feature_entity
    selected_feature_entity = None
    palette = ui.palettes.itemById(PALETTE_ID)
    if palette:
        try:
            palette.sendInfoToHTML('docActivated', json.dumps({'name': _active_doc_name()}))
        except Exception:
            futil.log(f"on_document_activated error: {traceback.format_exc()}")


# ===========================================================================
# Palette command / messaging
# ===========================================================================
def command_created(args: adsk.core.CommandCreatedEventArgs):
    futil.add_handler(args.command.execute, command_execute, local_handlers=local_handlers)
    futil.add_handler(args.command.destroy, command_destroy, local_handlers=local_handlers)


def command_execute(args: adsk.core.CommandEventArgs):
    futil.log(f"Command Execute: {CMD_NAME}")
    palettes = ui.palettes
    palette = palettes.itemById(PALETTE_ID)

    if palette is None:
        futil.log("Creating new palette...")
        palette = palettes.add(
            id=PALETTE_ID,
            name=PALETTE_NAME,
            htmlFileURL=PALETTE_URL,
            isVisible=True,
            showCloseButton=True,
            isResizable=True,
            width=520,
            height=640,
            useNewWebBrowser=True
        )
    else:
        futil.log("Found existing palette.")

    futil.add_handler(palette.closed, palette_closed)
    futil.add_handler(palette.incomingFromHTML, palette_incoming)

    if palette.dockingState == adsk.core.PaletteDockingStates.PaletteDockStateFloating:
        palette.dockingState = PALETTE_DOCKING
    palette.isVisible = True


def palette_closed(args: adsk.core.UserInterfaceGeneralEventArgs):
    futil.log("Palette closed.")


def _ok(data=None):
    return json.dumps({'ok': True, 'data': data})


def _err(message):
    return json.dumps({'ok': False, 'error': str(message)})


def palette_incoming(html_args: adsk.core.HTMLEventArgs):
    message_action = html_args.action
    futil.log(f"Incoming message from Palette: {message_action}")

    # Parse payload (JSON when possible).
    message_data = None
    if html_args.data:
        try:
            message_data = json.loads(html_args.data)
        except Exception:
            message_data = html_args.data

    try:
        html_args.returnData = route_message(message_action, message_data)
    except ValueError as e:
        futil.log(f"Rejected '{message_action}': {e}")
        html_args.returnData = _err(e)
    except Exception:
        futil.log(f"Error handling '{message_action}': {traceback.format_exc()}")
        html_args.returnData = _err(traceback.format_exc())


def route_message(action, data):
    # Housekeeping ---------------------------------------------------------
    if action == 'ready':
        return _ok({'global': load_global(), 'doc': _active_doc_name()})

    if action == 'jsLog':
        _handle_js_log(data)
        return _ok()

    # Global ---------------------------------------------------------------
    if action == 'global:list':
        return _ok(load_global())
    if action == 'global:save':
        params = data.get('params') if isinstance(data, dict) else data
        if not isinstance(params, list):
            return _err('global:save expects a list of params')
        save_global(params)
        return _ok(load_global())
    if action == 'global:pushToDesign':
        params = data.get('params') if isinstance(data, dict) else None
        return _ok(push_global_to_design(params))

    # Project (native design parameters) ----------------------------------
    if action == 'project:list':
        return _ok(list_project_params())
    if action == 'project:add':
        return _ok(add_project_param(data))
    if action == 'project:update':
        return _ok(update_project_param(data))
    if action == 'project:delete':
        return _ok(delete_project_param(data))

    # Feature (entity-attached params) ------------------------------------
    if action == 'feature:readSelection':
        return _ok(read_feature_selection())
    if action == 'feature:add':
        return _ok(add_feature_param(data))
    if action == 'feature:update':
        return _ok(update_feature_param(data))
    if action == 'feature:delete':
        return _ok(delete_feature_param(data))
    if action == 'feature:listAll':
        return _ok(list_all_feature_params())

    return _err(f"Unknown action: {action}")


def _handle_js_log(message_data):
    try:
        if isinstance(message_data, dict):
            level = message_data.get('level', 'info')
            msg = message_data.get('message', '')
            extra = message_data.get('extra', None)
            ts = message_data.get('ts', '')
            futil.log(f"[palette.js:{level}] {msg} {json.dumps(extra) if extra is not None else ''} {ts}".strip())
        else:
            futil.log(f"[palette.js] {message_data}")
    except Exception:
        futil.log(f"Error handling jsLog: {traceback.format_exc()}")


# ===========================================================================
# Helpers
# ===========================================================================
def sanitize_name(name):
    s = re.sub(r'[^a-zA-Z0-9_]', '_', name or '')
    if s and s[0].isdigit():
        s = '_' + s
    return s


def _active_doc_name():
    try:
        doc = app.activeDocument
        return doc.name if doc else ''
    except Exception:
        return ''


def _get_design():
    product = app.activeProduct
    design = adsk.fusion.Design.cast(product)
    return design


# ===========================================================================
# Global store (cross-document JSON file)
# ===========================================================================
def load_global():
    """Return the global params list. Migrates the legacy CSV/JSON on first run."""
    if not os.path.exists(DATA_FILE_GLOBAL):
        migrated = _migrate_legacy()
        if migrated is not None:
            save_global(migrated)
            return migrated
        return []

    try:
        with open(DATA_FILE_GLOBAL, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            return [_normalize_global(p) for p in data if isinstance(p, dict)]
        return []
    except Exception:
        futil.log(f"Error loading global store: {traceback.format_exc()}")
        return []


def _normalize_global(p):
    return {
        'name': p.get('name', ''),
        'expression': p.get('expression', p.get('value', '')),
        'unit': p.get('unit', ''),
        'comment': p.get('comment', ''),
        'category': p.get('category', ''),
    }


def save_global(params):
    global last_mtime
    normalized = [_normalize_global(p) for p in params if isinstance(p, dict) and p.get('name')]
    try:
        os.makedirs(os.path.dirname(DATA_FILE_GLOBAL), exist_ok=True)
        with open(DATA_FILE_GLOBAL, 'w', encoding='utf-8') as f:
            json.dump(normalized, f, indent=2)
        if os.path.exists(DATA_FILE_GLOBAL):
            last_mtime = os.path.getmtime(DATA_FILE_GLOBAL)
    except Exception:
        futil.log(f"Error saving global store: {traceback.format_exc()}")


def _migrate_legacy():
    """Convert the old per-project CSV/JSON into a flat global list.

    The old `Project` column becomes a `category` tag so no data is lost.
    """
    # Legacy CSV (preferred, it is what the add-in last wrote).
    if os.path.exists(LEGACY_DATA_FILE_CSV):
        try:
            out = []
            with open(LEGACY_DATA_FILE_CSV, 'r', newline='', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name = (row.get('Name') or '').strip()
                    if not name:
                        continue
                    out.append({
                        'name': name,
                        'expression': row.get('Value', ''),
                        'unit': row.get('Unit', ''),
                        'comment': row.get('Comment', ''),
                        'category': row.get('Project', '') or '',
                    })
            futil.log(f"Migrated {len(out)} params from legacy CSV.")
            return out
        except Exception:
            futil.log(f"Legacy CSV migration failed: {traceback.format_exc()}")

    # Legacy JSON ([{ name, params: [...] }]).
    if os.path.exists(LEGACY_DATA_FILE_JSON):
        try:
            out = []
            with open(LEGACY_DATA_FILE_JSON, 'r', encoding='utf-8') as f:
                projects = json.load(f)
            for proj in projects or []:
                category = proj.get('name', '')
                for p in proj.get('params', []):
                    if not p.get('name'):
                        continue
                    out.append({
                        'name': p.get('name', ''),
                        'expression': p.get('value', ''),
                        'unit': p.get('unit', ''),
                        'comment': p.get('comment', ''),
                        'category': category,
                    })
            futil.log(f"Migrated {len(out)} params from legacy JSON.")
            return out
        except Exception:
            futil.log(f"Legacy JSON migration failed: {traceback.format_exc()}")

    return None


def push_global_to_design(params=None):
    """Create/update user parameters in the active design from the global store."""
    design = _get_design()
    if not design:
        raise RuntimeError('No active design to push parameters into.')

    if params is None:
        params = load_global()

    user_params = design.userParameters
    created = 0
    updated = 0
    errors = []

    for p in params:
        name = sanitize_name(p.get('name', ''))
        if not name:
            continue
        expression = p.get('expression', p.get('value', ''))
        unit = p.get('unit', '') or ''
        comment = p.get('comment', '') or ''
        try:
            existing = user_params.itemByName(name)
            if existing:
                if existing.expression != expression and expression:
                    existing.expression = expression
                existing.comment = comment
                updated += 1
            else:
                value_input = adsk.core.ValueInput.createByString(expression)
                user_params.add(name, value_input, unit, comment)
                created += 1
        except Exception as e:
            errors.append(f"{name}: {e}")

    return {'created': created, 'updated': updated, 'errors': errors}


# ===========================================================================
# Project parameters (native design parameters)
# ===========================================================================
def _expression_is_editable(param, is_user):
    """Driving dimensions and user parameters can change expression.

    A sketch dimension that is driven (a measurement, not an input) exposes
    isDriving=False on the object that created the parameter. Those stay
    read-only. Feature dimensions have no such flag and are editable.
    """
    if is_user:
        return True
    try:
        created_by = param.createdBy
    except Exception:
        return True
    if created_by is None:
        return True
    try:
        is_driving = created_by.isDriving
    except Exception:
        return True
    return bool(is_driving)


def _serialize_param(param, is_user, is_deletable):
    try:
        expression = param.expression
    except Exception:
        expression = ''
    try:
        value = str(param.value)
    except Exception:
        value = ''
    try:
        unit = param.unit
    except Exception:
        unit = ''
    try:
        comment = param.comment
    except Exception:
        comment = ''
    return {
        'name': param.name,
        'expression': expression,
        'value': value,
        'unit': unit,
        'comment': comment,
        'isUserParam': is_user,
        'isDeletable': is_deletable,
        'isEditable': _expression_is_editable(param, is_user),
    }


def list_project_params():
    design = _get_design()
    if not design:
        return []

    result = []
    user_params = design.userParameters
    user_names = set()
    for i in range(user_params.count):
        p = user_params.item(i)
        user_names.add(p.name)
        result.append(_serialize_param(p, True, p.isDeletable))

    # Model parameters are the dimensions created by sketches and features.
    # Driving dimensions are editable; driven dimensions stay read-only.
    model_params = design.modelParameters
    for i in range(model_params.count):
        p = model_params.item(i)
        if p.name in user_names:
            continue
        result.append(_serialize_param(p, False, False))

    return result


def add_project_param(data):
    design = _get_design()
    if not design:
        raise RuntimeError('No active design.')
    name = sanitize_name(data.get('name', ''))
    expression = data.get('expression', '')
    unit = data.get('unit', '') or ''
    comment = data.get('comment', '') or ''
    if not name or not expression:
        raise ValueError('Name and expression are required.')

    user_params = design.userParameters
    if user_params.itemByName(name):
        raise ValueError(f"A parameter named '{name}' already exists.")

    value_input = adsk.core.ValueInput.createByString(expression)
    new_param = user_params.add(name, value_input, unit, comment)
    return _serialize_param(new_param, True, new_param.isDeletable)


def update_project_param(data):
    design = _get_design()
    if not design:
        raise RuntimeError('No active design.')
    original = data.get('originalName', '')
    # Model dimensions (sketch and feature sizes) live outside userParameters.
    param = design.allParameters.itemByName(original)
    if not param:
        raise ValueError(f"Parameter '{original}' not found.")

    is_user = design.userParameters.itemByName(original) is not None
    if not _expression_is_editable(param, is_user):
        raise ValueError(f"'{original}' is a driven dimension and cannot be edited.")

    new_name = sanitize_name(data.get('name', original))
    expression = data.get('expression', param.expression)
    comment = data.get('comment', '')

    try:
        if expression and expression != param.expression:
            param.expression = expression
        param.comment = comment or ''
        if new_name and new_name != param.name:
            param.name = new_name
    except Exception as e:
        raise ValueError(str(e)) from e

    still_user = design.userParameters.itemByName(param.name) is not None
    return _serialize_param(param, still_user, param.isDeletable if still_user else False)


def delete_project_param(data):
    design = _get_design()
    if not design:
        raise RuntimeError('No active design.')
    name = data.get('name', '')
    param = design.userParameters.itemByName(name)
    if not param:
        raise ValueError(f"Parameter '{name}' not found.")
    if not param.isDeletable:
        raise ValueError(f"Parameter '{name}' is in use and cannot be deleted.")
    param.deleteMe()
    return {'name': name}


# ===========================================================================
# Feature parameters (user params associated with a selected entity)
# ===========================================================================
def _entity_label(entity):
    try:
        type_name = entity.objectType.split('::')[-1]
    except Exception:
        type_name = 'Entity'
    name = ''
    try:
        name = entity.name
    except Exception:
        name = ''
    return (f"{type_name}: {name}" if name else type_name), type_name


def _feature_params_for_entity(entity):
    """Read the ProParams feature attributes on an entity and resolve each to its
    user parameter."""
    design = _get_design()
    params = []
    if not entity or not design:
        return params
    try:
        attrs = entity.attributes
    except Exception:
        return params

    user_params = design.userParameters
    for i in range(attrs.count):
        attr = attrs.item(i)
        if attr.groupName != FEATURE_ATTR_GROUP:
            continue
        param_name = attr.value or attr.name
        up = user_params.itemByName(param_name)
        if up:
            params.append({
                'name': up.name,
                'expression': up.expression,
                'value': str(up.value),
                'unit': up.unit,
                'comment': up.comment,
            })
        else:
            # Attribute left dangling (param deleted elsewhere) - surface it anyway.
            params.append({
                'name': param_name,
                'expression': '',
                'value': '',
                'unit': '',
                'comment': '(missing parameter)',
            })
    return params


def read_feature_selection():
    global selected_feature_entity
    selections = ui.activeSelections
    if selections.count == 0:
        selected_feature_entity = None
        return {'hasSelection': False, 'params': []}

    entity = selections.item(0).entity
    selected_feature_entity = entity
    label, type_name = _entity_label(entity)
    return {
        'hasSelection': True,
        'entity': {'label': label, 'entityType': type_name},
        'params': _feature_params_for_entity(entity),
    }


def _require_selected_entity():
    entity = selected_feature_entity
    if entity is None:
        # Fall back to the live selection if still present.
        selections = ui.activeSelections
        if selections.count > 0:
            entity = selections.item(0).entity
    if entity is None:
        raise RuntimeError('No entity selected. Click "Read selection" after selecting a face, edge, or body.')
    return entity


def _tag_entity(entity, param_name):
    try:
        entity.attributes.add(FEATURE_ATTR_GROUP, param_name, param_name)
    except Exception:
        futil.log(f"Could not tag entity with '{param_name}': {traceback.format_exc()}")


def add_feature_param(data):
    design = _get_design()
    if not design:
        raise RuntimeError('No active design.')
    entity = _require_selected_entity()

    name = sanitize_name(data.get('name', ''))
    expression = data.get('expression', '')
    unit = data.get('unit', '') or ''
    comment = data.get('comment', '') or ''
    if not name or not expression:
        raise ValueError('Name and expression are required.')

    user_params = design.userParameters
    existing = user_params.itemByName(name)
    if existing:
        # Reuse the existing user parameter but associate it with this entity.
        if expression and existing.expression != expression:
            existing.expression = expression
        existing.comment = comment
    else:
        value_input = adsk.core.ValueInput.createByString(expression)
        user_params.add(name, value_input, unit, comment)

    _tag_entity(entity, name)
    return read_feature_selection()


def update_feature_param(data):
    design = _get_design()
    if not design:
        raise RuntimeError('No active design.')
    entity = _require_selected_entity()
    original = data.get('originalName', '')
    user_params = design.userParameters
    param = user_params.itemByName(original)
    if not param:
        raise ValueError(f"Parameter '{original}' not found.")

    new_name = sanitize_name(data.get('name', original))
    expression = data.get('expression', param.expression)
    comment = data.get('comment', '')

    if expression and expression != param.expression:
        param.expression = expression
    param.comment = comment or ''
    if new_name and new_name != param.name:
        # Re-tag the entity under the new name.
        _remove_entity_tag(entity, original)
        param.name = new_name
        _tag_entity(entity, new_name)

    return read_feature_selection()


def _remove_entity_tag(entity, param_name):
    try:
        attrs = entity.attributes
        attr = attrs.itemByName(FEATURE_ATTR_GROUP, param_name)
        if attr:
            attr.deleteMe()
    except Exception:
        futil.log(f"Could not remove tag '{param_name}': {traceback.format_exc()}")


def delete_feature_param(data):
    design = _get_design()
    if not design:
        raise RuntimeError('No active design.')
    entity = _require_selected_entity()
    name = data.get('name', '')

    # Remove the association from the entity.
    _remove_entity_tag(entity, name)

    # Delete the backing user parameter if it is no longer used elsewhere.
    param = design.userParameters.itemByName(name)
    if param and param.isDeletable:
        try:
            param.deleteMe()
        except Exception:
            futil.log(f"Could not delete user param '{name}': {traceback.format_exc()}")

    return read_feature_selection()


def list_all_feature_params():
    design = _get_design()
    if not design:
        return {'entities': []}
    entities = []
    try:
        attrs = design.findAttributes(FEATURE_ATTR_GROUP, '')
        seen = {}
        for attr in attrs:
            parent = attr.parent
            if parent is None:
                continue
            key = id(parent)
            if key not in seen:
                label, type_name = _entity_label(parent)
                seen[key] = {'label': label, 'entityType': type_name, 'params': _feature_params_for_entity(parent)}
        entities = list(seen.values())
    except Exception:
        futil.log(f"list_all_feature_params error: {traceback.format_exc()}")
    return {'entities': entities}


def command_destroy(args: adsk.core.CommandEventArgs):
    global local_handlers
    local_handlers = []
