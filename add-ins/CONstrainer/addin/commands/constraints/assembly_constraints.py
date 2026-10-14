"""List and edit assembly constraints made with Assemble > Constrain Components.

Fusion exposes these through a preview API (AssemblyConstraint, July 2025), so every
call is guarded and the tab reports when the running Fusion does not support it.
"""

import adsk.core
import adsk.fusion

from ...lib import fusionAddInUtils as futil
from . import joints as j

app = adsk.core.Application.get()
ui = app.userInterface

_ASSEMBLY_CONSTRAINT = getattr(adsk.fusion, 'AssemblyConstraint', None)


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


def select(data):
    design = j._require_joints()
    constraint = _find_constraint(design, (data or {}).get('token', ''))
    ui.activeSelections.clear()
    try:
        ui.activeSelections.add(constraint)
    except Exception as exc:
        raise ValueError('Fusion could not select that constraint.') from exc
    return {'selected': 1}


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
