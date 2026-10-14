"""Better Parameters — open a window for editing Fusion parameters by object."""

import importlib.util
import json
import os
import traceback

import adsk.core
import adsk.fusion

CMD_ID = 'ceBetterParameters'
PALETTE_ID = 'ceBetterParametersPalette'
COMMIT_EVENT_ID = 'ceBetterParametersCommit'
PANEL_ID = 'SolidScriptsAddinsPanel'
CMD_NAME = 'Better Parameters'
CMD_TOOLTIP = 'Edit parameters for the selection or the whole design, and copy a parameter name.'

_app = None
_ui = None
_parameters = None
_created_handler = None
_html_handler = None
_selection_handler = None
_terminated_handler = None
_document_handler = None
_execute_handlers = []
_commit_handler = None
_custom_event = None
_change_log = []
_to_commit = []
_browser = None
_version = 0
_updating = False


def run(context):
    global _app, _ui
    try:
        _app = adsk.core.Application.get()
        _ui = _app.userInterface
        _load_parameters()
        _cleanup()
        _create_command()
        _connect_events()
    except:
        _report('Failed to start Better Parameters:\n{}'.format(traceback.format_exc()))


def stop(context):
    try:
        _cleanup()
    except:
        _log('Better Parameters failed to stop:\n{}'.format(traceback.format_exc()))


def _addin_dir():
    return os.path.dirname(os.path.realpath(__file__))


def _load_parameters():
    global _parameters
    module_path = os.path.join(_addin_dir(), 'parameters.py')
    spec = importlib.util.spec_from_file_location('ce_parameters_model', module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _parameters = module


def _create_command():
    global _created_handler
    icon_folder = os.path.join(_addin_dir(), 'resources', 'icons')
    command = _ui.commandDefinitions.addButtonDefinition(CMD_ID, CMD_NAME, CMD_TOOLTIP, icon_folder)
    _created_handler = _CreatedHandler()
    command.commandCreated.add(_created_handler)

    panel = _ui.allToolbarPanels.itemById(PANEL_ID)
    if not panel:
        _report('Better Parameters could not find the Add-Ins toolbar panel.')
        return
    control = panel.controls.addCommand(command)
    try:
        control.isPromoted = True
    except:
        pass
    try:
        control.isPromotedByDefault = True
    except:
        pass


def _connect_events():
    global _selection_handler, _terminated_handler, _document_handler, _commit_handler, _custom_event
    _selection_handler = _SelectionHandler()
    _ui.activeSelectionChanged.add(_selection_handler)
    _terminated_handler = _CommandTerminatedHandler()
    _ui.commandTerminated.add(_terminated_handler)
    _document_handler = _DocumentHandler()
    _app.documentActivated.add(_document_handler)
    _custom_event = _app.registerCustomEvent(COMMIT_EVENT_ID)
    if not _custom_event:
        try:
            _app.unregisterCustomEvent(COMMIT_EVENT_ID)
        except:
            pass
        _custom_event = _app.registerCustomEvent(COMMIT_EVENT_ID)
    _commit_handler = _CommitHandler()
    if _custom_event:
        _custom_event.add(_commit_handler)


def _cleanup():
    global _created_handler, _html_handler, _selection_handler, _terminated_handler, _document_handler, _commit_handler, _custom_event, _browser, _change_log
    if not _ui:
        return

    if _selection_handler:
        try:
            _ui.activeSelectionChanged.remove(_selection_handler)
        except:
            pass
        _selection_handler = None
    if _terminated_handler:
        try:
            _ui.commandTerminated.remove(_terminated_handler)
        except:
            pass
        _terminated_handler = None
    if _app and _document_handler:
        try:
            _app.documentActivated.remove(_document_handler)
        except:
            pass
        _document_handler = None

    panel = _ui.allToolbarPanels.itemById(PANEL_ID)
    if panel:
        control = panel.controls.itemById(CMD_ID)
        if control:
            try:
                control.deleteMe()
            except:
                pass

    command = _ui.commandDefinitions.itemById(CMD_ID)
    if command:
        if _created_handler:
            try:
                command.commandCreated.remove(_created_handler)
            except:
                pass
        try:
            command.deleteMe()
        except:
            pass
    _created_handler = None
    _browser = None
    _execute_handlers.clear()
    _save_changes()

    if _custom_event and _commit_handler:
        try:
            _custom_event.remove(_commit_handler)
        except:
            pass
    if _app:
        try:
            _app.unregisterCustomEvent(COMMIT_EVENT_ID)
        except:
            pass
    _commit_handler = None
    _custom_event = None

    palette = _ui.palettes.itemById(PALETTE_ID)
    if palette:
        if _html_handler:
            try:
                palette.incomingFromHTML.remove(_html_handler)
            except:
                pass
        try:
            palette.deleteMe()
        except:
            pass
    _html_handler = None


def _palette_markup():
    folder = os.path.join(_addin_dir(), 'resources')
    with open(os.path.join(folder, 'palette.html'), encoding='utf-8') as handle:
        html = handle.read()
    with open(os.path.join(folder, 'palette.css'), encoding='utf-8') as handle:
        css = handle.read()
    with open(os.path.join(folder, 'palette.js'), encoding='utf-8') as handle:
        script = handle.read()
    html = html.replace('<!DOCTYPE html>\n', '', 1)
    html = html.replace(
        '<link id="palette-styles" rel="stylesheet" href="palette.css">',
        '<style id="palette-styles">\n{}\n</style>'.format(css),
        1,
    )
    html = html.replace(
        '<script id="palette-script" src="palette.js"></script>',
        '<script id="palette-script">\n{}\n</script>'.format(script),
        1,
    )
    return html.lstrip()


def _palette_file():
    runtime = os.path.join(_addin_dir(), 'resources', 'palette-runtime.html')
    with open(runtime, 'w', encoding='utf-8') as handle:
        handle.write(_palette_markup())
    return os.path.abspath(runtime).replace('\\', '/')


def _editor_open():
    return _browser is not None


def _queue_save():
    global _change_log, _to_commit
    if not _change_log:
        return
    _to_commit = list(_change_log)
    _change_log = []
    try:
        if _app and _app.fireCustomEvent(COMMIT_EVENT_ID, 'commit'):
            return
    except:
        _log(traceback.format_exc())
    _save_changes()


def _save_changes():
    global _to_commit
    if not _to_commit:
        return
    pending = _to_commit
    _to_commit = []
    for entry in pending:
        try:
            _replay_change(entry.get('action'), entry.get('data'))
        except:
            _log(traceback.format_exc())


def _replay_change(action, data):
    error = _apply_change(action, data)
    if action != 'add' or not error:
        return error
    try:
        payload = json.loads(data or '{}')
    except Exception:
        return error
    return _parameters.apply_edit(
        _app,
        payload.get('name') or '',
        payload.get('expression') if 'expression' in payload else None,
        payload.get('comment') if 'comment' in payload else None,
    )


def _push_update(edit_error=None):
    global _version, _updating
    if _updating or not _parameters:
        return
    if not _browser:
        return
    _updating = True
    try:
        _version += 1
        try:
            payload = _parameters.build_payload(_app, _ui)
        except:
            _log(traceback.format_exc())
            payload = _parameters.empty_payload('Could not read parameters.')
        payload['version'] = _version
        if edit_error:
            payload['editError'] = edit_error
        _browser.sendInfoToHTML('update', json.dumps(payload))
    except:
        _log(traceback.format_exc())
    finally:
        _updating = False


def _handle_html(action, data):
    if action in ('ready', 'refresh'):
        _push_update()
        return
    if action == 'copied':
        _note_copied(data)
        return
    if action not in ('edit', 'add', 'delete'):
        return
    error = _apply_change(action, data)
    if not error:
        _change_log.append({'action': action, 'data': data or '{}'})
    _push_update(error)


def _apply_change(action, data):
    try:
        payload = json.loads(data or '{}')
    except Exception:
        return 'Could not read that request.'
    name = payload.get('name') or ''
    try:
        if action == 'add':
            return _parameters.add_user_parameter(
                _app,
                name,
                payload.get('expression') or '',
                payload.get('units') if 'units' in payload else '',
                payload.get('comment') or '',
            )
        if action == 'delete':
            return _parameters.delete_parameter(_app, name)
        expression = payload.get('expression') if 'expression' in payload else None
        comment = payload.get('comment') if 'comment' in payload else None
        return _parameters.apply_edit(_app, name, expression, comment)
    except:
        _log(traceback.format_exc())
        return 'Could not update "{}".'.format(name or 'the parameter')


def _note_copied(data):
    try:
        payload = json.loads(data or '{}')
    except Exception:
        payload = {}
    text = str(payload.get('text') or '').strip()
    if not text or not _ui:
        return
    try:
        _ui.statusMessage = 'Copied {}'.format(text)
        adsk.doEvents()
    except:
        _log(traceback.format_exc())


def _log(message):
    try:
        adsk.core.Application.get().log(message)
    except:
        pass


def _report(message):
    _log(message)
    try:
        if _ui:
            _ui.messageBox(message)
    except:
        pass


class _CreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        global _browser, _html_handler, _change_log
        try:
            _change_log = []
            palette = _ui.palettes.itemById(PALETTE_ID)
            if palette:
                try:
                    palette.deleteMe()
                except:
                    pass
            command = adsk.core.Command.cast(args.command)
            command.isRepeatable = False
            command.isAutoExecute = False
            command.isOKButtonVisible = False
            command.isExecutedWhenPreEmpted = False
            command.setDialogInitialSize(1180, 800)
            command.setDialogMinimumSize(760, 520)
            browser = command.commandInputs.addBrowserCommandInput(
                'ceParametersBrowser',
                '',
                _palette_file(),
                700,
                0,
            )
            if not browser:
                _report('Better Parameters could not open its editor.')
                return
            browser.isFullWidth = True
            _browser = browser
            _html_handler = _HtmlHandler()
            command.incomingFromHTML.add(_html_handler)
            activate_handler = _ActivateHandler()
            command.activate.add(activate_handler)
            destroy_handler = _DestroyHandler()
            command.destroy.add(destroy_handler)
            _execute_handlers.extend([_html_handler, activate_handler, destroy_handler])
        except:
            _report('Failed to start Better Parameters:\n{}'.format(traceback.format_exc()))


class _ActivateHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        try:
            command = adsk.core.CommandEventArgs.cast(args).command
            command.setDialogSize(1180, 800)
            if _browser:
                _browser.isFullWidth = True
                _browser.minimumHeight = 700
        except:
            _log(traceback.format_exc())


class _DestroyHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        global _browser, _change_log
        _browser = None
        try:
            reason = adsk.core.CommandEventArgs.cast(args).terminationReason
        except:
            reason = None
        if reason == adsk.core.CommandTerminationReason.CompletedTerminationReason:
            _change_log = []
            return
        _queue_save()


class _CommitHandler(adsk.core.CustomEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        try:
            _save_changes()
        except:
            _log(traceback.format_exc())


class _HtmlHandler(adsk.core.HTMLEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        try:
            args.returnData = '{"ok": true}'
            _handle_html(args.action, args.data)
        except:
            _log(traceback.format_exc())
            try:
                args.returnData = '{"ok": false}'
            except:
                pass


class _SelectionHandler(adsk.core.ActiveSelectionEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        try:
            if _editor_open():
                _push_update()
        except:
            _log(traceback.format_exc())


class _CommandTerminatedHandler(adsk.core.ApplicationCommandEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        try:
            if args.commandId == CMD_ID or not _editor_open():
                return
            _push_update()
        except:
            _log(traceback.format_exc())


class _DocumentHandler(adsk.core.DocumentEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        try:
            if _editor_open():
                _push_update()
        except:
            _log(traceback.format_exc())
