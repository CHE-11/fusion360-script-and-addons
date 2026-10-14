"""List, create, and edit assembly joints and as-built joints."""

import adsk.core
import adsk.fusion

from ...lib import fusionAddInUtils as futil

app = adsk.core.Application.get()
ui = app.userInterface

MOTIONS = [
    {'type': 'rigid', 'label': 'Rigid', 'valueKind': 'none'},
    {'type': 'revolute', 'label': 'Revolute', 'valueKind': 'angle'},
    {'type': 'slider', 'label': 'Slider', 'valueKind': 'distance'},
    {'type': 'cylindrical', 'label': 'Cylindrical', 'valueKind': 'angle'},
    {'type': 'pinSlot', 'label': 'Pin-slot', 'valueKind': 'distance'},
    {'type': 'planar', 'label': 'Planar', 'valueKind': 'angle'},
    {'type': 'ball', 'label': 'Ball', 'valueKind': 'none'},
]

_MOTION_BY_TYPE = {item['type']: item for item in MOTIONS}


def empty_selection():
    return {
        'geometries': [],
        'occurrences': [],
        'canCreateJoint': False,
        'canCreateAsBuilt': False,
        'motions': [],
        'error': None,
    }


def list_joints():
    design = _design()
    joints = []
    for comp in _components(design):
        component_name = _safe_name(comp, 'Component')
        for index in range(comp.joints.count):
            joints.append(_serialize_joint(comp.joints.item(index), False, component_name))
        for index in range(comp.asBuiltJoints.count):
            joints.append(_serialize_joint(comp.asBuiltJoints.item(index), True, component_name))
    joints.sort(key=lambda item: (item['name'].lower(), item['motionLabel'].lower()))
    return {'joints': joints}


def delete_joint(data):
    design = _design()
    joint = _find(design, (data or {}).get('token', ''))
    name = _safe_name(joint, 'Joint')
    try:
        joint.deleteMe()
    except Exception as exc:
        raise ValueError(str(exc)) from exc
    return {'name': name}


def rename_joint(data):
    design = _design()
    payload = data or {}
    joint = _find(design, payload.get('token', ''))
    name = str(payload.get('name', '') or '').strip()
    if not name:
        raise ValueError('Name is required.')
    try:
        joint.name = name
    except Exception as exc:
        raise ValueError(str(exc)) from exc
    return _serialize_found(design, joint)


def set_suppressed(data):
    design = _design()
    payload = data or {}
    joint = _find(design, payload.get('token', ''))
    try:
        joint.isSuppressed = bool(payload.get('suppressed'))
    except Exception as exc:
        raise ValueError(str(exc)) from exc
    return _serialize_found(design, joint)


def select_joint(token):
    design = _design()
    joint = _find(design, token)
    ui.activeSelections.clear()
    try:
        ui.activeSelections.add(joint)
    except Exception as exc:
        raise ValueError('Fusion could not select that joint.') from exc
    return {'selected': 1}


def read_selection():
    try:
        _design()
    except RuntimeError as exc:
        result = empty_selection()
        result['error'] = str(exc)
        return result

    geometries = []
    occurrences = []
    try:
        selections = ui.activeSelections
        count = selections.count
    except Exception:
        return empty_selection()

    if count == 0:
        return empty_selection()

    for index in range(count):
        try:
            entity = selections.item(index).entity
        except Exception:
            continue
        occurrence = _occurrence(entity)
        if occurrence is not None:
            _append_occurrence(occurrences, occurrence)
        described = _describe_geometry(entity)
        if described is None and occurrence is not None:
            described = _describe_from_occurrence(occurrence)
            if described and not any(item['token'] == _token(occurrence) for item in occurrences):
                _append_occurrence(occurrences, occurrence)
        if described and not any(item['token'] == described['token'] for item in geometries):
            geometries.append(described)

    geometries = geometries[:2]
    occurrences = occurrences[:2]
    can_joint = len(geometries) >= 2
    can_as_built = len(occurrences) >= 2 and len(geometries) >= 1
    result = {
        'geometries': geometries,
        'occurrences': occurrences,
        'canCreateJoint': can_joint,
        'canCreateAsBuilt': can_as_built,
        'motions': MOTIONS if (can_joint or can_as_built) else [],
        'error': None,
    }
    if not geometries:
        return result
    if len(geometries) == 1 and not can_as_built:
        result['error'] = 'Select one more face, edge, point, or joint origin.'
    return result


def add_joint(data):
    design = _design()
    payload = data or {}
    motion = payload.get('motion', '')
    if motion not in _MOTION_BY_TYPE:
        raise ValueError('Choose a joint type.')
    expression = str(payload.get('expression', '') or '')
    geometry_tokens = payload.get('geometryTokens') or []
    if len(geometry_tokens) < 1:
        raise ValueError('Select geometry for the joint.')

    geometries = [_resolve_geometry(design, token) for token in geometry_tokens[:2]]
    as_built = bool(payload.get('asBuilt'))
    root = design.rootComponent

    try:
        if as_built:
            occurrence_tokens = payload.get('occurrenceTokens') or []
            if len(occurrence_tokens) < 2:
                raise ValueError('As-built joints need two components.')
            first = _as_occurrence(_find(design, occurrence_tokens[0]))
            second = _as_occurrence(_find(design, occurrence_tokens[1]))
            if _token(first) == _token(second):
                raise ValueError('Pick two different components.')
            joint_input = root.asBuiltJoints.createInput(first, second, geometries[0])
            _apply_motion(joint_input, motion, expression)
            created = root.asBuiltJoints.add(joint_input)
            _apply_saved_value(created, motion, expression)
            return _serialize_joint(created, True, _safe_name(root, 'Root'))

        if len(geometries) < 2:
            raise ValueError('Select two faces, edges, points, or joint origins.')
        joint_input = root.joints.createInput(geometries[0], geometries[1])
        _apply_motion(joint_input, motion, expression)
        created = root.joints.add(joint_input)
        _apply_saved_value(created, motion, expression)
        return _serialize_joint(created, False, _safe_name(root, 'Root'))
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(str(exc)) from exc


def _apply_saved_value(joint, motion, expression):
    """Planar motion has no value argument on the input, so set rotation after create."""
    text = (expression or '').strip()
    if motion != 'planar' or not text:
        return
    try:
        planar = adsk.fusion.PlanarJointMotion.cast(joint.jointMotion)
        if planar and planar.rotationValue:
            planar.rotationValue.expression = text
    except Exception:
        futil.log(f'Could not set planar rotation: {text}')


def _apply_motion(joint_input, motion, expression):
    z_axis = adsk.fusion.JointDirections.ZAxisJointDirection
    x_axis = adsk.fusion.JointDirections.XAxisJointDirection
    if motion == 'rigid':
        joint_input.setAsRigidJointMotion()
        return
    if motion == 'revolute':
        _invoke(joint_input.setAsRevoluteJointMotion, (z_axis, _value('angle', expression)))
        return
    if motion == 'slider':
        _invoke(joint_input.setAsSliderJointMotion, (z_axis, _value('distance', expression)))
        return
    if motion == 'cylindrical':
        _invoke(
            joint_input.setAsCylindricalJointMotion,
            (z_axis, _value('angle', expression), _literal('0 mm')),
        )
        return
    if motion == 'pinSlot':
        _invoke(
            joint_input.setAsPinSlotJointMotion,
            (z_axis, _value('distance', expression), _literal('0 deg')),
        )
        return
    if motion == 'planar':
        _invoke(joint_input.setAsPlanarJointMotion, (z_axis,))
        return
    if motion == 'ball':
        _invoke(joint_input.setAsBallJointMotion, (z_axis, x_axis))
        return
    raise ValueError(f'Unknown joint type: {motion}')


def _invoke(method, args):
    extra = []
    last_error = None
    for _ in range(3):
        try:
            return method(*args, *extra)
        except TypeError as exc:
            last_error = exc
            extra.append(None)
    raise ValueError(str(last_error) if last_error else 'Could not set the joint motion.')


def _value(kind, expression):
    text = (expression or '').strip()
    if not text:
        text = '0 deg' if kind == 'angle' else '0 mm'
    return adsk.core.ValueInput.createByString(text)


def _literal(text):
    return adsk.core.ValueInput.createByString(text)


def _serialize_found(design, joint):
    is_as_built = adsk.fusion.AsBuiltJoint.cast(joint) is not None
    component_name = 'Component'
    try:
        component_name = _safe_name(joint.parentComponent, 'Component')
    except Exception:
        component_name = 'Component'
    return _serialize_joint(joint, is_as_built, component_name)


def _serialize_joint(joint, is_as_built, component_name):
    motion, label = _motion_info(joint)
    return {
        'token': _token(joint),
        'name': _safe_name(joint, 'Joint'),
        'motion': motion,
        'motionLabel': label,
        'sideOne': _side_label(_read_attr(joint, 'occurrenceOne')),
        'sideTwo': _side_label(_read_attr(joint, 'occurrenceTwo')),
        'isAsBuilt': is_as_built,
        'isSuppressed': _is_suppressed(joint),
        'component': component_name,
    }


def _motion_info(joint):
    try:
        joint_type = joint.jointMotion.jointType
    except Exception:
        return ('unknown', 'Joint')
    types = adsk.fusion.JointTypes
    mapping = (
        (types.RigidJointType, 'rigid', 'Rigid'),
        (types.RevoluteJointType, 'revolute', 'Revolute'),
        (types.SliderJointType, 'slider', 'Slider'),
        (types.CylindricalJointType, 'cylindrical', 'Cylindrical'),
        (types.PinSlotJointType, 'pinSlot', 'Pin-slot'),
        (types.PlanarJointType, 'planar', 'Planar'),
        (types.BallJointType, 'ball', 'Ball'),
    )
    for enum_value, key, label in mapping:
        if joint_type == enum_value:
            return (key, label)
    return ('unknown', 'Joint')


def _describe_geometry(entity):
    if entity is None or adsk.fusion.Occurrence.cast(entity):
        return None
    token = _token(entity)
    if not token:
        return None
    if _to_joint_geometry(entity) is None:
        return None
    return {
        'label': _geometry_label(entity),
        'token': token,
        'kind': _geometry_kind(entity),
    }


def _describe_from_occurrence(occurrence):
    entity = _entity_from_occurrence(occurrence)
    if entity is None:
        return None
    return _describe_geometry(entity)


def _entity_from_occurrence(occurrence):
    try:
        component = occurrence.component
    except Exception:
        return None
    try:
        if component.jointOrigins.count > 0:
            origin = component.jointOrigins.item(0)
            return _proxy(origin, occurrence)
    except Exception:
        pass
    try:
        if component.bRepBodies.count > 0:
            body = _proxy(component.bRepBodies.item(0), occurrence)
            if body is not None and body.faces.count > 0:
                return body.faces.item(0)
    except Exception:
        return None
    return None


def _proxy(entity, occurrence):
    try:
        return entity.createForAssemblyContext(occurrence)
    except Exception:
        return entity


def _resolve_geometry(design, token):
    entity = _find(design, token)
    geometry = _to_joint_geometry(entity)
    if geometry is None:
        raise ValueError(f'{_geometry_label(entity)} cannot define a joint.')
    return geometry


def _to_joint_geometry(entity):
    if adsk.fusion.JointOrigin.cast(entity):
        return entity
    if adsk.fusion.JointGeometry.cast(entity):
        return entity

    face = adsk.fusion.BRepFace.cast(entity)
    if face:
        if _is_planar_face(face):
            return _planar_geometry(face)
        try:
            return adsk.fusion.JointGeometry.createByNonPlanarFace(
                face, adsk.fusion.JointKeyPointTypes.CenterKeyPoint
            )
        except Exception:
            return None

    edge = adsk.fusion.BRepEdge.cast(entity)
    if edge:
        return _curve_geometry(edge)

    curve = adsk.fusion.SketchCurve.cast(entity)
    if curve:
        return _curve_geometry(curve)

    if (
        adsk.fusion.SketchPoint.cast(entity)
        or adsk.fusion.BRepVertex.cast(entity)
        or adsk.fusion.ConstructionPoint.cast(entity)
    ):
        try:
            return adsk.fusion.JointGeometry.createByPoint(entity)
        except Exception:
            return None
    return None


def _planar_geometry(face):
    center = adsk.fusion.JointKeyPointTypes.CenterKeyPoint
    edge = None
    try:
        if face.edges.count > 0:
            edge = face.edges.item(0)
    except Exception:
        edge = None
    try:
        return adsk.fusion.JointGeometry.createByPlanarFace(face, edge, center)
    except Exception:
        if edge is None:
            return None
        try:
            return adsk.fusion.JointGeometry.createByPlanarFace(face, None, center)
        except Exception:
            return None


def _curve_geometry(curve):
    try:
        return adsk.fusion.JointGeometry.createByCurve(
            curve, adsk.fusion.JointKeyPointTypes.MiddleKeyPoint
        )
    except Exception:
        return None


def _is_planar_face(face):
    try:
        return face.geometry.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType
    except Exception:
        return False


def _geometry_kind(entity):
    if adsk.fusion.JointOrigin.cast(entity):
        return 'jointOrigin'
    face = adsk.fusion.BRepFace.cast(entity)
    if face:
        return 'planarFace' if _is_planar_face(face) else 'face'
    if adsk.fusion.BRepEdge.cast(entity) or adsk.fusion.SketchCurve.cast(entity):
        return 'curve'
    return 'point'


def _geometry_label(entity):
    if adsk.fusion.JointOrigin.cast(entity):
        return f"Joint origin: {_safe_name(entity, 'Joint origin')}"
    face = adsk.fusion.BRepFace.cast(entity)
    if face:
        return 'Planar face' if _is_planar_face(face) else 'Face'
    if adsk.fusion.BRepEdge.cast(entity):
        return 'Edge'
    if adsk.fusion.BRepVertex.cast(entity):
        return 'Vertex'
    if adsk.fusion.SketchPoint.cast(entity):
        return 'Sketch point'
    if adsk.fusion.SketchCurve.cast(entity):
        return 'Sketch curve'
    if adsk.fusion.ConstructionPoint.cast(entity):
        return 'Construction point'
    occurrence = adsk.fusion.Occurrence.cast(entity)
    if occurrence:
        return f"Component: {_safe_name(occurrence, 'Component')}"
    return 'Geometry'


def _append_occurrence(occurrences, occurrence):
    token = _token(occurrence)
    if not token or any(item['token'] == token for item in occurrences):
        return
    occurrences.append({
        'name': _safe_name(occurrence, 'Component'),
        'token': token,
    })


def _occurrence(entity):
    occurrence = adsk.fusion.Occurrence.cast(entity)
    if occurrence:
        return occurrence
    try:
        context = entity.assemblyContext
    except Exception:
        return None
    return adsk.fusion.Occurrence.cast(context) if context else None


def _as_occurrence(entity):
    occurrence = adsk.fusion.Occurrence.cast(entity)
    if not occurrence:
        raise ValueError('As-built joints need component occurrences.')
    return occurrence


def _side_label(occurrence):
    if occurrence is None:
        return 'Root'
    return _safe_name(occurrence, 'Component')


def _is_suppressed(joint):
    try:
        return bool(joint.isSuppressed)
    except Exception:
        return False


def _components(design):
    components = design.allComponents
    for index in range(components.count):
        yield components.item(index)


def _design():
    design = adsk.fusion.Design.cast(app.activeProduct)
    if not design:
        raise RuntimeError('No active design.')
    return design


def _find(design, token):
    if not token:
        raise ValueError('Missing item id.')
    try:
        found = design.findEntityByToken(token)
    except Exception as exc:
        raise ValueError('That item is no longer in the design.') from exc
    found = _unwrap(found)
    if found is None:
        raise ValueError('That item is no longer in the design.')
    return found


def _unwrap(found):
    if found is None:
        return None
    try:
        if found.objectType == 'adsk::core::ObjectCollection':
            if found.count < 1:
                return None
            return found.item(0)
    except Exception:
        return found
    return found


def _token(entity):
    if entity is None:
        return ''
    try:
        return entity.entityToken or ''
    except Exception:
        return ''


def _safe_name(entity, fallback):
    try:
        name = entity.name
    except Exception:
        return fallback
    return name or fallback


def _read_attr(obj, name):
    try:
        value = getattr(obj, name)
    except Exception:
        return None
    if value is None or callable(value):
        return None
    return value
