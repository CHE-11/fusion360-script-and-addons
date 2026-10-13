import adsk.core
import adsk.fusion
import json
import traceback

def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface

        app.log('\n\n--------------------------------')
        app.log('Starting Rename Script - v1.0.1')
        app.log('--------------------------------')

        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            ui.messageBox('No active Fusion design found.')
            return

        root = design.rootComponent

        # Internal APIs Fusion uses for "Move to Group" (Surface Groups).
        # These are not part of the public API, but they are often the only reliable
        # way to read body groups across Fusion builds.
        try:
            import neu_server  # type: ignore
            import neu_modeling  # type: ignore
        except:
            neu_server = None
            neu_modeling = None

        def _safe_getattr(obj, attr_name, default=None):
            try:
                return getattr(obj, attr_name)
            except:
                return default

        def _call_if_callable(value):
            try:
                if callable(value):
                    return value()
                return value
            except:
                return None

        def _is_browser_folder(browser_node):
            if not browser_node:
                return False

            object_type = _safe_getattr(browser_node, 'objectType', '') or ''
            if 'BrowserFolder' in object_type:
                return True

            is_folder = _call_if_callable(_safe_getattr(browser_node, 'isFolder', None))
            return is_folder is True


        def _restore_selection_from_paths(paths: list):
            sels: adsk.core.Selections = ui.activeSelections
            try:
                sels.clear()
            except:
                pass

            for p in paths:
                try:
                    app.executeTextCommand(u'Selections.Add {}'.format(p))
                except:
                    continue

        def _get_selected_entity_id_preserve(ent, preserve_paths: list) -> int:
            """
            Gets internal entity id for `ent` without permanently changing user selection.
            """
            sels: adsk.core.Selections = ui.activeSelections
            try:
                sels.clear()
            except:
                pass

            try:
                sels.add(ent)
                txt = app.executeTextCommand(u'Selections.List').rstrip('\n\r')
            except:
                txt = ''

            _restore_selection_from_paths(preserve_paths)

            if not txt:
                return -1
            last_line = txt.splitlines()[-1].strip()
            last_seg = last_line.split(':')[-1].strip()
            try:
                return int(last_seg)
            except:
                return -1

        # ---- Selection-only output ----
        try:
            selection_list_txt = app.executeTextCommand(u'Selections.List').rstrip('\n\r')
            preserve_paths = [ln.strip() for ln in selection_list_txt.splitlines() if ln.strip()]
        except:
            preserve_paths = []

        sels: adsk.core.Selections = ui.activeSelections
        if sels.count < 1:
            ui.messageBox('Select one or more bodies/sketches, then run the script again.')
            return

        base_name, cancelled = ui.inputBox('Enter a base name. Selected items will be renamed to base_1, base_2, ...', 'Rename Selected')
        if cancelled:
            return

        base_name = (base_name or '').strip()
        if not base_name:
            ui.messageBox('Base name cannot be empty.')
            return

        # Try to pair each active selection with its internal entity id by order.
        # If Fusion changes formatting/order, we will fall back to per-entity selection queries.
        selection_paths_by_index = preserve_paths if len(preserve_paths) == sels.count else []

        # IMPORTANT: We mutate the UI selection later (to query internal ids),
        # so we must snapshot the selected entities up front to avoid
        # "invalid argument index" when selections change mid-loop.
        selected_entities = []
        try:
            for i in range(sels.count):
                selected_entities.append(sels.item(i).entity)
        except:
            # If the selection is volatile, fall back to whatever we captured.
            pass

        app.log(f"Base name: {base_name}")

        renamed = 0
        skipped = 0

        for i, ent in enumerate(selected_entities):

            ent_type = _safe_getattr(ent, 'objectType', None)
            ent_name = _safe_getattr(ent, 'name', None)

            # Best-effort internal entity id.
            ent_id = -1
            if selection_paths_by_index:
                try:
                    last_seg = selection_paths_by_index[i].split(':')[-1].strip()
                    ent_id = int(last_seg)
                except:
                    ent_id = -1
            if ent_id < 0:
                ent_id = _get_selected_entity_id_preserve(ent, preserve_paths)

            body = adsk.fusion.BRepBody.cast(ent)
            occ = adsk.fusion.Occurrence.cast(ent)
            sketch = adsk.fusion.Sketch.cast(ent)

            if body:
                renamed += 1
                new_name = f"{base_name}_{renamed}"
                old_name = body.name
                body.name = new_name

                app.log(f"{old_name} -> {new_name}")
                continue

            if sketch:
                renamed += 1
                new_name = f"{base_name}_{renamed}"
                old_name = sketch.name
                sketch.name = new_name
                app.log(f"{old_name} -> {new_name}")
                continue

            if occ:
                occ_path = occ.fullPathName if hasattr(occ, 'fullPathName') else occ.name
                skipped += 1
                app.log(f"SKIP | occurrence selected: {occ_path}")
                continue

            skipped += 1
            app.log(f"SKIP | type={ent_type} | name={ent_name} | id={ent_id}")

        app.log(f"Done. Renamed={renamed} Skipped={skipped}")


    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))