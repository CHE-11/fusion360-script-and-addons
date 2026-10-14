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
from datetime import datetime

app = adsk.core.Application.get()
ui = app.userInterface

CMD_ID = f'{config.COMPANY_NAME}_{config.ADDIN_NAME}_PalleteShow'
CMD_NAME = 'ProParams Manager'
CMD_Description = 'Manage Global Parameters'
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

DATA_FILE_JSON = os.path.join(os.path.dirname(os.path.abspath(config.__file__)), 'ProParams_data.json')
DATA_FILE_CSV = os.path.join(os.path.dirname(os.path.abspath(config.__file__)), 'ProParams_data.csv')

WATCHER_EVENT_ID = f'{config.COMPANY_NAME}_{config.ADDIN_NAME}_FileWatcher'

local_handlers = []
watcher_thread = None
stop_watcher_event = threading.Event()
last_mtime = 0

def start():
    cmd_def = ui.commandDefinitions.addButtonDefinition(CMD_ID, CMD_NAME, CMD_Description, ICON_FOLDER)
    futil.add_handler(cmd_def.commandCreated, command_created)
    workspace = ui.workspaces.itemById(WORKSPACE_ID)
    panel = workspace.toolbarPanels.itemById(PANEL_ID)
    control = panel.controls.addCommand(cmd_def, COMMAND_BESIDE_ID, False)
    control.isPromoted = IS_PROMOTED

    # Register Custom Event for File Watcher
    custom_event = app.registerCustomEvent(WATCHER_EVENT_ID)
    if custom_event:
        futil.add_handler(custom_event, on_file_changed)

    # Start Watcher Thread
    global watcher_thread, last_mtime
    stop_watcher_event.clear()
    
    if os.path.exists(DATA_FILE_CSV):
        last_mtime = os.path.getmtime(DATA_FILE_CSV)
    
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
    # app.unregisterCustomEvent(WATCHER_EVENT_ID) # Not strictly necessary as it cleans up on restart usually, but good practice if futil doesn't clear it. 
    # futil.clear_handlers handles the event handler, but unregisterCustomEvent removes the event definition.
    try:
        app.unregisterCustomEvent(WATCHER_EVENT_ID)
    except:
        pass

def watch_loop():
    global last_mtime
    while not stop_watcher_event.is_set():
        if os.path.exists(DATA_FILE_CSV):
            try:
                mtime = os.path.getmtime(DATA_FILE_CSV)
                # Check for change (allow small tolerance or strict inequality)
                if last_mtime != 0 and mtime > last_mtime:
                    last_mtime = mtime
                    app.fireCustomEvent(WATCHER_EVENT_ID)
                elif last_mtime == 0:
                     last_mtime = mtime
            except:
                pass
        time.sleep(1)

def on_file_changed(args):
    # Reload data
    data = load_data()
    
    # Update Palette if open
    palette = ui.palettes.itemById(PALETTE_ID)
    if palette:
        palette.sendInfoToHTML('loadData', json.dumps(data))
        
    # Sync Params to Active Design
    sync_all_projects(data)

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
            width=400,
            height=600,
            useNewWebBrowser=True
        )
    else:
        futil.log("Found existing palette.")

    # Always add handlers, as they are cleared on stop/reload
    # Note: futil helps avoid duplicates if managed correctly, but here we just ensure they exist.
    # To be safe, we can clear them first or just add.
    # Since we cleared handlers in stop(), we need to re-add them to the existing palette object event if it survived.
    futil.add_handler(palette.closed, palette_closed)
    futil.add_handler(palette.incomingFromHTML, palette_incoming)
    
    if palette.dockingState == adsk.core.PaletteDockingStates.PaletteDockStateFloating:
        palette.dockingState = PALETTE_DOCKING
    palette.isVisible = True

def palette_closed(args: adsk.core.UserInterfaceGeneralEventArgs):
    futil.log("Palette closed.")

def palette_incoming(html_args: adsk.core.HTMLEventArgs):
    futil.log(f"Incoming message from Palette: {html_args.action}")
    message_action = html_args.action

    # Some actions (like jsLog) can send either JSON strings or plain strings.
    message_data = None
    if html_args.data:
        try:
            message_data = json.loads(html_args.data)
        except Exception:
            # Don't break the handler because JS sent non-JSON.
            futil.log(f"Non-JSON payload from palette for action '{message_action}': {html_args.data}")
            message_data = html_args.data

    if message_action == 'ready':
        futil.log("Received 'ready' event. Loading data...")
        data = load_data()
        palette = ui.palettes.itemById(PALETTE_ID)
        if palette:
            palette.sendInfoToHTML('loadData', json.dumps(data))
            futil.log("Sent data to palette.")

    elif message_action == 'jsLog':
        # Structured logs forwarded from the palette JS.
        # Expected: { level, message, extra, ts }
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
            
    elif message_action == 'saveData':
        if not isinstance(message_data, list):
            futil.log(f"saveData payload invalid (expected list). Got: {type(message_data)}")
        else:
            save_data(message_data)
        
    elif message_action == 'syncProject':
        if not isinstance(message_data, dict):
            futil.log(f"syncProject payload invalid (expected dict). Got: {type(message_data)}")
        else:
            sync_project(message_data)

    html_args.returnData = 'OK'

def load_data():
    futil.log(f"Attempting to load data from: {DATA_FILE_CSV}")
    # Migration
    if os.path.exists(DATA_FILE_JSON) and not os.path.exists(DATA_FILE_CSV):
        try:
            futil.log("Migrating JSON to CSV...")
            with open(DATA_FILE_JSON, 'r') as f:
                json_data = json.load(f)
            save_data(json_data)
        except Exception as e:
            futil.log(f"Migration error: {e}")

    if not os.path.exists(DATA_FILE_CSV):
        futil.log("CSV file not found.")
        return []
        
    projects_map = {}
    try:
        with open(DATA_FILE_CSV, 'r', newline='', encoding='utf-8-sig') as f:
            futil.log("CSV file opened successfully.")
            reader = csv.DictReader(f)
            row_count = 0
            for row in reader:
                row_count += 1
                p_name = row.get('Project', 'Default')
                if not p_name: continue

                if p_name not in projects_map:
                    projects_map[p_name] = {'name': p_name, 'params': []}
                
                param_name = row.get('Name', '').strip()
                if param_name:
                    projects_map[p_name]['params'].append({
                        'name': param_name,
                        'value': row.get('Value', ''),
                        'unit': row.get('Unit', ''),
                        'comment': row.get('Comment', '')
                    })
            futil.log(f"Read {row_count} rows. Loaded {len(projects_map)} projects.")
    except Exception as e:
        futil.log(f"Error loading CSV: {e}")
        return []
    
    return list(projects_map.values())

def save_data(data):
    rows = []
    for proj in data:
        p_name = proj['name']
        if not proj['params']:
             rows.append({
                'Project': p_name,
                'Name': '',
                'Value': '',
                'Unit': '',
                'Comment': ''
            })
        else:
            for p in proj['params']:
                rows.append({
                    'Project': p_name,
                    'Name': p['name'],
                    'Value': p['value'],
                    'Unit': p.get('unit', ''),
                    'Comment': p.get('comment', '')
                })
            
    try:
        global last_mtime
        with open(DATA_FILE_CSV, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['Project', 'Name', 'Value', 'Unit', 'Comment']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            
        if os.path.exists(DATA_FILE_CSV):
            last_mtime = os.path.getmtime(DATA_FILE_CSV)
    except Exception as e:
        futil.log(f"Error saving CSV: {e}")

def sanitize_name(name):
    # Replace non-alphanumeric with _
    s = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    if s and s[0].isdigit():
        s = '_' + s
    return s

def sync_all_projects(data):
    product = app.activeProduct
    design = adsk.fusion.Design.cast(product)
    if not design:
        return

    for proj in data:
        sync_project(proj, show_message=False)

def sync_project(project, show_message=True):
    product = app.activeProduct
    design = adsk.fusion.Design.cast(product)
    if not design:
        if show_message: ui.messageBox('Active document is not a Design')
        return

    params = design.userParameters
    proj_name = sanitize_name(project['name'])

    for p in project['params']:
        p_name = sanitize_name(p['name'])
        
        full_name = f"{proj_name}_{p_name}"
        
        # Check uniqueness globally in design if needed, but here we target specific name
        existing = params.itemByName(full_name)
        
        val_str = p['value']
        unit = p.get('unit', '')
        comment = p.get('comment', '')

        try:
            if existing:
                if existing.expression != val_str:
                    existing.expression = val_str
                existing.comment = comment
            else:
                # ValueInput needed? No, add can take string expression if unit is provided
                # createByString requires (name, value, units, comment)
                # Ensure unit is valid or empty (which implies internal units or unitless)
                if not unit:
                    unit = '' # Default
                
                # If creating with ValueInput, we need real value.
                # Use expression based creation
                value_input = adsk.core.ValueInput.createByString(val_str)
                params.add(full_name, value_input, unit, comment)
        except Exception as e:
            futil.log(f"Error syncing {full_name}: {e}")
            # ui.messageBox(f"Error syncing {full_name}: {e}")

    if show_message: ui.messageBox(f"Synced project '{project['name']}' to active design.")

def command_destroy(args: adsk.core.CommandEventArgs):
    global local_handlers
    local_handlers = []
