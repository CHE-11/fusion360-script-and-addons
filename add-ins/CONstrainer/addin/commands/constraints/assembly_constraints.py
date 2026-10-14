"""List and edit assembly constraints made with Assemble > Constrain Components.

Fusion exposes these through a preview API (AssemblyConstraint, July 2025), so every
call is guarded and the tab reports when the running Fusion does not support it.
"""

from contextlib import contextmanager

import adsk.core
import adsk.fusion

from ...lib import fusionAddInUtils as futil
from . import joints as j

app = adsk.core.Application.get()
ui = app.userInterface

_ASSEMBLY_CONSTRAINT = getattr(adsk.fusion, 'AssemblyConstraint', None)
_highlight_set = None
_highlight_token = None
_saved_selection = None
_pinned = False
_suspend_depth = 0


def is_supported():
    return _ASSEMBLY_CONSTRAINT is not None


def empty_selection():
    return {'focus': None, 'direct': [], 'component': []}


def list_constraints():
    design = j._design()
    intent = j._intent_name(design)
    if intent not in ('assembly', 'hybrid'):
        return {'constraints': [], 'supported': is_supported(), 'allowed': False}
    if not is_supported():
        return {'constraints': [], 'supported': False, 'allowed': True}
    root_token = j._token(design.rootComponent)
    constraints = [_serialize(*entry) for entry in _all_constraints(design)]
    constraints.sort(key=lambda item: (
        0 if item['componentToken'] == root_token else 1,
        item['component'].lower(),
        item['name'].lower(),
    ))
    return {'constraints': constraints, 'supported': True, 'allowed': True}


def read_selection():
    try:
        design = j._require_joints()
    except (RuntimeError, ValueError):
        return empty_selection()
    if not is_supported():
        return empty_selection()
    try:
        selections = ui.activeSelections
        count = selections.count
    except Exception:
        return empty_selection()

    for index in range(count):
        try:
            entity = selections.item(index).entity
        except Exception:
            continue
        if not j._focus_kind(entity):
            continue
        occurrence = j._occurrence(entity)
        direct, component = _related(design, entity, occurrence)
        return {'focus': j._describe_focus(entity, occurrence), 'direct': direct, 'component': component}
    return empty_selection()


def rename(data):
    design = j._require_joints()
    payload = data or {}
    constraint = _find_constraint(design, payload.get('token', ''))
    name = str(payload.get('name', '') or '').strip()
    if not name:
        raise ValueError('Name is required.')
    _apply(lambda: setattr(constraint, 'name', name))
    return _serialize_found(constraint)


def set_suppressed(data):
    design = j._require_joints()
    payload = data or {}
    constraint = _find_constraint(design, payload.get('token', ''))
    _apply(lambda: setattr(constraint, 'isSuppressed', bool(payload.get('suppressed'))))
    return _serialize_found(constraint)


def set_visible(data):
    design = j._require_joints()
    payload = data or {}
    constraint = _find_constraint(design, payload.get('token', ''))
    _apply(lambda: setattr(constraint, 'isLightBulbOn', bool(payload.get('visible'))))
    return _serialize_found(constraint)


def delete(data):
    design = j._require_joints()
    constraint = _find_constraint(design, (data or {}).get('token', ''))
    name = j._safe_name(constraint, 'Constraint')
    _apply(constraint.deleteMe)
    return {'name': name}


def selection_suspended():
    """True while a hover highlight owns the selection, so the palette does not follow it."""
    return _suspend_depth > 0 or (_highlight_token is not None and not _pinned)


def highlight(data):
    """Select the constraint briefly so Fusion highlights it in the canvas and timeline.

    Faces and edges are also added to a highlight set when Fusion will report them.
    The previous selection is restored by clear_highlight.
    """
    global _highlight_token, _pinned
    design = j._require_joints()
    token = str((data or {}).get('token', '') or '')
    constraint = _find_constraint(design, token)
    with _selection_suspended():
        if _saved_selection is None:
            _remember_selection()
        _pinned = False
        _highlight_token = token
        selected = _try_select(constraint)
        geometry = _highlight_geometry(constraint)
        if not selected and geometry == 0:
            _restore_selection()
            _highlight_token = None
            return {'highlighted': 0, 'selected': False, 'geometry': 0}
    return {'highlighted': 1, 'selected': selected, 'geometry': geometry}


def clear_highlight(data=None):
    """Drop a hover highlight and restore the selection from before it.

    Calling this with no argument, as document changes and add-in shutdown do, forgets the
    saved selection instead of writing it into a different document. A pinned highlight from
    the locate button stays until another constraint is highlighted or this is forced.
    """
    global _highlight_token, _pinned, _saved_selection
    force = data is None or bool((data or {}).get('force'))
    token = str((data or {}).get('token', '') or '') if data is not None else ''
    if not force and _pinned:
        return {'cleared': False}
    if not force and token and _highlight_token and token != _highlight_token:
        return {'cleared': False}
    with _selection_suspended():
        _clear_highlight_set()
        if force:
            _saved_selection = None
        else:
            _restore_selection()
        _highlight_token = None
        _pinned = False
    return {'cleared': True}


def select(data):
    """Leave the constraint selected so the canvas glyph and timeline node stay highlighted."""
    global _highlight_token, _pinned, _saved_selection
    design = j._require_joints()
    token = str((data or {}).get('token', '') or '')
    constraint = _find_constraint(design, token)
    _saved_selection = None
    _pinned = True
    _highlight_token = token
    if not _try_select(constraint):
        _pinned = False
        _highlight_token = None
        raise ValueError('Fusion could not highlight that constraint.')
    geometry = _highlight_geometry(constraint)
    return {'selected': 1, 'geometry': geometry}


def set_value(data):
    """Edit the offset or angle parameter. Parameters can change without rolling the timeline."""
    design = j._require_joints()
    payload = data or {}
    constraint = _find_constraint(design, payload.get('token', ''))
    relationship = _relationship_at(constraint, payload.get('index'))
    parameter = j._read_attr(relationship, 'offsetOrAngle')
    if parameter is None:
        raise ValueError('This relationship has no offset or angle to edit.')
    expression = str(payload.get('expression', '') or '').strip()
    if not expression:
        raise ValueError('Enter a value, for example 5 mm or 90 deg.')
    _apply(lambda: setattr(parameter, 'expression', expression))
    return _serialize_found(constraint)


def set_flipped(data):
    design = j._require_joints()
    payload = data or {}
    token = payload.get('token', '')
    index = payload.get('index')
    flipped = bool(payload.get('flipped'))
    constraint = _find_constraint(design, token)

    def flip():
        relationship = _relationship_at(constraint, index)
        relationship.isFlipped = flipped

    _with_timeline_before(design, constraint, flip)
    return _serialize_found(_find_constraint(design, token))


def set_relationship_suppressed(data):
    design = j._require_joints()
    payload = data or {}
    constraint = _find_constraint(design, payload.get('token', ''))
    relationship = _relationship_at(constraint, payload.get('index'))
    _apply(lambda: setattr(relationship, 'isSuppressed', bool(payload.get('suppressed'))))
    return _serialize_found(constraint)


def _all_constraints(design):
    for comp in j._components(design):
        collection = j._read_attr(comp, 'assemblyConstraints')
        if collection is None:
            continue
        component_name = j._safe_name(comp, 'Component')
        component_token = j._token(comp)
        try:
            count = collection.count
        except Exception:
            continue
        for index in range(count):
            try:
                constraint = collection.item(index)
            except Exception:
                continue
            if constraint is not None:
                yield constraint, component_name, component_token


def _serialize_found(constraint):
    component = j._read_attr(constraint, 'parentComponent')
    component_name = j._safe_name(component, 'Component') if component else 'Component'
    component_token = j._token(component) if component else ''
    return _serialize(constraint, component_name, component_token)


def _serialize(constraint, component_name, component_token):
    relationships = [_serialize_relationship(rel, index) for index, rel in enumerate(j._relationships(constraint))]
    side_one, side_two = _sides(constraint)
    return {
        'token': j._token(constraint),
        'name': j._safe_name(constraint, 'Constraint'),
        'typeLabel': _type_label(relationships),
        'sideOne': side_one,
        'sideTwo': side_two,
        'isSuppressed': j._is_suppressed(constraint),
        'isLightBulbOn': j._is_light_bulb_on(constraint),
        'isVisible': j._is_visible(constraint),
        'health': _health(constraint),
        'message': j._read_attr(constraint, 'errorOrWarningMessage') or '',
        'relationships': relationships,
        'component': component_name,
        'componentToken': component_token,
    }


def _serialize_relationship(relationship, index):
    parameter = j._read_attr(relationship, 'offsetOrAngle')
    is_mate = j._read_attr(relationship, 'isMate')
    return {
        'index': index,
        'name': j._read_attr(relationship, 'name') or f'Relationship {index + 1}',
        'type': 'angle' if is_mate is False else 'mate',
        'isFlipped': bool(j._read_attr(relationship, 'isFlipped')),
        'isSuppressed': bool(j._read_attr(relationship, 'isSuppressed')),
        'expression': j._expression(parameter),
        'parameterName': j._safe_name(parameter, '') if parameter else '',
        'entityOne': _entity_label(j._read_attr(relationship, 'entityOne')),
        'entityTwo': _entity_label(j._read_attr(relationship, 'entityTwo')),
    }


def _type_label(relationships):
    kinds = {item['type'] for item in relationships}
    if kinds == {'angle'}:
        return 'Angle'
    if 'angle' in kinds:
        return 'Mate + angle'
    return 'Mate'


def _entity_label(entity):
    if entity is None:
        return 'Geometry'
    label = j._geometry_label(entity)
    occurrence = j._occurrence(entity)
    return f'{label} · {j._safe_name(occurrence, "Component")}' if occurrence else label


def _sides(constraint):
    sides = []
    for relationship in j._relationships(constraint):
        for name in ('entityOne', 'entityTwo'):
            label = j._side_label(j._occurrence(j._read_attr(relationship, name)))
            if label not in sides:
                sides.append(label)
    while len(sides) < 2:
        sides.append('Root')
    return sides[0], sides[1]


def _health(constraint):
    state = j._read_attr(constraint, 'healthState')
    states = adsk.fusion.FeatureHealthStates
    if state == states.ErrorFeatureHealthState:
        return 'error'
    if state == states.WarningFeatureHealthState:
        return 'warning'
    return 'ok'


def _entities(constraint):
    entities = []
    for relationship in j._relationships(constraint):
        for name in ('entityOne', 'entityTwo'):
            entity = j._read_attr(relationship, name)
            if entity is not None:
                entities.append(entity)
    return entities


def _related(design, entity, occurrence):
    body = adsk.fusion.BRepBody.cast(entity)
    is_component = adsk.fusion.Occurrence.cast(entity) is not None
    direct = []
    component = []
    for constraint, component_name, component_token in _all_constraints(design):
        entities = _entities(constraint)
        touches = occurrence is not None and any(j._same(j._occurrence(item), occurrence) for item in entities)
        if is_component:
            uses = touches
        elif body is not None:
            uses = any(j._same(j._read_attr(item, 'body'), body) for item in entities)
        else:
            uses = any(j._same(item, entity) for item in entities)
        if uses:
            direct.append(_serialize(constraint, component_name, component_token))
        elif touches:
            component.append(_serialize(constraint, component_name, component_token))
    return direct, component


def _find_constraint(design, token):
    if not is_supported():
        raise ValueError('This version of Fusion does not expose assembly constraints to add-ins.')
    found = j._find(design, token)
    constraint = _ASSEMBLY_CONSTRAINT.cast(found)
    if not constraint:
        raise ValueError('That assembly constraint is no longer in the design.')
    return constraint


def _relationship_at(constraint, index):
    relationships = j._relationships(constraint)
    try:
        return relationships[int(index)]
    except (TypeError, ValueError, IndexError) as exc:
        raise ValueError('That relationship is no longer on the constraint.') from exc


@contextmanager
def _selection_suspended():
    global _suspend_depth
    _suspend_depth += 1
    try:
        yield
    finally:
        _suspend_depth -= 1


def _remember_selection():
    global _saved_selection
    captured = []
    try:
        selections = ui.activeSelections
        for index in range(selections.count):
            try:
                captured.append(selections.item(index).entity)
            except Exception:
                continue
    except Exception:
        captured = []
    _saved_selection = captured


def _restore_selection():
    global _saved_selection
    saved = _saved_selection
    _saved_selection = None
    if saved is None:
        return
    try:
        ui.activeSelections.clear()
    except Exception:
        return
    for entity in saved:
        if entity is None:
            continue
        try:
            ui.activeSelections.add(entity)
        except Exception:
            pass


def _try_select(constraint):
    """Select the constraint and its timeline feature. Returns whether Fusion accepted either."""
    try:
        selections = ui.activeSelections
        selections.clear()
    except Exception:
        return False
    targets = [constraint]
    timeline_object = j._read_attr(constraint, 'timelineObject')
    if timeline_object is not None:
        targets.append(timeline_object)
        feature = j._read_attr(timeline_object, 'entity')
        if feature is not None:
            targets.append(feature)
    added = False
    for target in targets:
        try:
            if selections.add(target) is not False:
                added = True
        except Exception:
            pass
    return added


def _highlight_geometry(constraint):
    """Highlight the faces and edges Fusion can report without rolling the timeline."""
    global _highlight_set
    _clear_highlight_set()
    entities = _entities(constraint)
    if not entities:
        return 0
    try:
        highlight = ui.highlightSets.add()
    except Exception:
        return 0
    added = 0
    for entity in entities:
        try:
            if highlight.add(entity) is not False:
                added += 1
        except Exception:
            pass
    if added == 0:
        try:
            highlight.deleteMe()
        except Exception:
            pass
        return 0
    _highlight_set = highlight
    return added


def _clear_highlight_set():
    global _highlight_set
    if _highlight_set is None:
        return
    try:
        _highlight_set.deleteMe()
    except Exception:
        pass
    _highlight_set = None


def _apply(action):
    try:
        action()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(str(exc)) from exc


def _with_timeline_before(design, constraint, action):
    """Geometry edits on an existing constraint need the timeline marker just before it."""
    timeline_object = j._read_attr(constraint, 'timelineObject')
    timeline = j._read_attr(design, 'timeline')
    if timeline_object is None or timeline is None:
        _apply(action)
        return
    marker = timeline.markerPosition
    at_end = marker >= timeline.count
    try:
        timeline_object.rollTo(True)
        _apply(action)
    finally:
        try:
            if at_end:
                timeline.moveToEnd()
            else:
                timeline.markerPosition = marker
        except Exception:
            futil.log('Could not restore the timeline marker after editing a constraint.')
