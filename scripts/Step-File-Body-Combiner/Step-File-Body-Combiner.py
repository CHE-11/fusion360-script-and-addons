"""
Combine every body in the active design into the root component.

Open the imported STEP design, then run this script. Each body keeps its
current position. Subcomponents are removed afterward, so the parts cannot
move independently when this design is inserted into another assembly.
"""

import adsk.core
import adsk.fusion
import traceback


def run(context):
    ui = None
    progress = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface

        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            ui.messageBox('No active Fusion design found. Open the STEP design, then run this script.')
            return

        # Edits land at the end of the history. A rolled-back marker would
        # capture the new bodies in the wrong place.
        parametric = design.designType == adsk.fusion.DesignTypes.ParametricDesignType
        if parametric:
            timeline = design.timeline
            if timeline and timeline.markerPosition < timeline.count:
                ui.messageBox('Move the timeline marker to the end, then run the script again.')
                return

        design.activateRootComponent()
        root = design.rootComponent

        if _has_mesh_bodies(root):
            ui.messageBox(
                'This design contains mesh bodies. The script only combines solid and surface bodies, '
                'and removing the original components would delete those meshes.\n\n'
                'Nothing was changed.'
            )
            return

        if root.occurrences.count == 0:
            ui.messageBox(
                'All bodies are already in the root component.\n\n'
                'There are no subcomponents that can move on their own when this design is used in another assembly.'
            )
            return

        bodies = []
        identity = adsk.core.Matrix3D.create()
        _collect_bodies(root, identity, None, bodies)
        _uniquify_labels(bodies)

        if not bodies:
            ui.messageBox('No solid or surface bodies were found in this design.')
            return

        component_count = root.allOccurrences.count
        answer = ui.messageBox(
            'Copy {} bodies into the root component and remove {} subcomponents?\n\n'
            'Bodies keep their current positions. They stay separate solids, but they will belong to '
            'one component, so they cannot move independently in other assemblies.\n\n'
            'Sketches, joints, and construction geometry inside the subcomponents will be removed.'.format(
                len(bodies), component_count
            ),
            'Combine STEP Bodies',
            adsk.core.MessageBoxButtonTypes.YesNoButtonType,
            adsk.core.MessageBoxIconTypes.QuestionIconType,
        )
        if answer != adsk.core.DialogResults.DialogYes:
            return

        progress = ui.createProgressDialog()
        progress.isCancelButtonShown = True
        progress.show('Combine STEP Bodies', 'Copying bodies: %v of %m', 0, len(bodies))

        original_root_bodies = [root.bRepBodies.item(i) for i in range(root.bRepBodies.count)]
        original_occurrences = [root.occurrences.item(i) for i in range(root.occurrences.count)]
        timeline_start = design.timeline.count if parametric else 0

        temp_brep = adsk.fusion.TemporaryBRepManager.get()
        base_feature = None
        if parametric:
            base_feature = root.features.baseFeatures.add()
            try:
                base_feature.name = 'Combined STEP Bodies'
            except:
                pass
            base_feature.startEdit()

        created = []
        failures = []
        cancelled = False

        for index, (body, transform, label, appearance, visible) in enumerate(bodies):
            if progress.wasCancelled:
                cancelled = True
                break

            progress.progressValue = index
            adsk.doEvents()

            try:
                cloned = temp_brep.copy(body)
                temp_brep.transform(cloned, transform)
                new_body = _add_body(root, cloned, base_feature)
                _apply_body_attributes(new_body, body, label, appearance, visible)
                created.append(new_body)
            except:
                failures.append(label)
                app.log('Failed to copy "{}":\n{}'.format(label, traceback.format_exc()))

        if parametric and base_feature:
            base_feature.finishEdit()

        if cancelled or failures:
            _rollback_copies(parametric, base_feature, created)
            progress.hide()
            progress = None
            if cancelled:
                ui.messageBox('Cancelled. The design was not changed.')
            else:
                preview = '\n'.join(failures[:8])
                extra = ''
                if len(failures) > 8:
                    extra = '\n...'
                ui.messageBox(
                    'Could not copy {} of {} bodies, so nothing was changed.\n\n{}{}'.format(
                        len(failures), len(bodies), preview, extra
                    )
                )
            return

        progress.progressValue = len(bodies)
        progress.message = 'Removing original components...'
        adsk.doEvents()

        delete_errors = 0
        for occurrence in original_occurrences:
            try:
                if occurrence.isValid:
                    occurrence.deleteMe()
            except:
                delete_errors += 1
                app.log('Failed to remove a component:\n{}'.format(traceback.format_exc()))

        removed_root_bodies = 0
        for body in original_root_bodies:
            try:
                if body.isValid:
                    body.deleteMe()
                    removed_root_bodies += 1
            except:
                delete_errors += 1
                app.log('Failed to remove an original root body:\n{}'.format(traceback.format_exc()))

        if parametric:
            _group_new_timeline_features(design, timeline_start)

        progress.hide()
        progress = None

        if delete_errors:
            message = (
                'Copied {} bodies into the root component, but {} original items could not be removed.\n\n'
                'Check the TEXT COMMANDS window for details. Some original components may still be in the browser.'
            ).format(len(created), delete_errors)
        else:
            message = 'Combined {} bodies into the root component and removed {} subcomponents.'.format(
                len(created), component_count
            )
            if removed_root_bodies:
                message += '\n{} bodies that were already in the root were replaced by the copies.'.format(
                    removed_root_bodies
                )
            message += (
                '\n\nThe bodies are still separate solids, but they now belong to one component. '
                'They will move together when this design is inserted into another assembly.'
            )
        ui.messageBox(message)

    except:
        if progress:
            progress.hide()
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def _collect_bodies(component, world, inherited_appearance, results):
    """Collect native bodies with the transform that places them in root space.

    Occurrence transforms are relative to the parent component. Post-multiplying
    the parent world matrix produces the root transform for this instance, including
    repeated instances of the same component.
    """
    for index in range(component.bRepBodies.count):
        body = component.bRepBodies.item(index)
        appearance = _safe_appearance(body) or inherited_appearance
        results.append((
            body,
            world.copy(),
            _body_label(component, body),
            appearance,
            body.isLightBulbOn,
        ))

    for index in range(component.occurrences.count):
        occurrence = component.occurrences.item(index)
        child_world = occurrence.transform2.copy()
        child_world.transformBy(world)
        override = _safe_appearance(occurrence) or inherited_appearance
        _collect_bodies(occurrence.component, child_world, override, results)


def _has_mesh_bodies(component, seen=None):
    if seen is None:
        seen = set()

    token = component.entityToken
    if token in seen:
        return False
    seen.add(token)

    if component.meshBodies.count > 0:
        return True

    for index in range(component.occurrences.count):
        if _has_mesh_bodies(component.occurrences.item(index).component, seen):
            return True
    return False


def _uniquify_labels(bodies):
    """Give repeated part instances distinct names. Fusion rejects a duplicate body name."""
    used = set()
    for index, (body, transform, label, appearance, visible) in enumerate(bodies):
        unique = label
        suffix = 2
        while unique in used:
            unique = '{} {}'.format(label, suffix)
            suffix += 1
        used.add(unique)
        bodies[index] = (body, transform, unique, appearance, visible)


def _body_label(component, body):
    body_name = body.name or ''
    component_name = component.name or 'Body'
    generic_names = ('', 'body', 'body1', 'solid', 'solid1', 'brep', 'brep1')
    if body_name.lower() in generic_names or body_name == component_name:
        return component_name
    return '{} - {}'.format(component_name, body_name)


def _add_body(component, cloned, base_feature):
    """Add a temporary body. Parametric designs require an open base feature.

    Direct designs accept either a single argument or a null base feature,
    depending on the Fusion build.
    """
    if base_feature:
        return component.bRepBodies.add(cloned, base_feature)

    try:
        return component.bRepBodies.add(cloned)
    except:
        return component.bRepBodies.add(cloned, None)


def _apply_body_attributes(body, source_body, label, appearance, visible):
    try:
        body.name = label
    except:
        pass

    if appearance:
        try:
            body.appearance = appearance
        except:
            pass

    try:
        if source_body.material:
            body.material = source_body.material
    except:
        pass

    try:
        body.isLightBulbOn = visible
    except:
        pass


def _safe_appearance(entity):
    try:
        return entity.appearance
    except:
        return None


def _rollback_copies(parametric, base_feature, created):
    if parametric and base_feature and base_feature.isValid:
        try:
            base_feature.deleteMe()
            return
        except:
            pass

    for body in created:
        try:
            if body.isValid:
                body.deleteMe()
        except:
            pass


def _group_new_timeline_features(design, start_index):
    """Group the features this script added so one Undo reverses the combine."""
    try:
        timeline = design.timeline
        if not timeline:
            return

        end_index = timeline.count - 1
        if start_index < end_index:
            timeline.timelineGroups.add(start_index, end_index)
    except:
        pass
