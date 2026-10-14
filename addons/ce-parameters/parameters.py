"""Group Fusion parameters by the object that owns them, and apply edits."""

import re

import adsk.core
import adsk.fusion

REFERENCED_MESSAGE = 'Parameters for this component live in the referenced design.'
NO_BODY_MESSAGE = 'This body has no driving parameters.'
NO_SKETCH_MESSAGE = 'This sketch has no driving parameters.'
NO_GEOMETRY_MESSAGE = 'This sketch geometry has no driving parameters.'
NO_COMPONENT_MESSAGE = 'This component has no parameters.'
NO_SELECTION_MESSAGE = 'This selection has no driving parameters.'
NO_DIMENSION_MESSAGE = 'This dimension has no parameter.'


class _ParamRecord(object):
    def __init__(self, data, created_by):
        self.data = data
        self.created_by = created_by


class _ObjectBucket(object):
    def __init__(self, name, kind, sketch, bodies):
        self.name = name
        self.kind = kind
        self.sketch = sketch
        self.bodies = bodies
        self.parameters = []


class _ComponentBucket(object):
    def __init__(self, component, name):
        self.component = component
        self.name = name
        self.objects = []
        self._keys = {}

    def object_for(self, key, name, kind, sketch, bodies):
        existing = self._keys.get(key)
        if existing:
            return existing
        bucket = _ObjectBucket(name, kind, sketch, bodies)
        self._keys[key] = bucket
        self.objects.append(bucket)
        return bucket


class _Catalog(object):
    def __init__(self):
        self.user_parameters = []
        self.components = []
        self._components = {}
        self._body_cache = {}

    def objects(self):
        for component in self.components:
            for obj in component.objects:
                yield obj


class _SelectionMatch(object):
    def __init__(self, mode, title, kind, message='', component=None, include_user=False, bodies=None, sketch=None, creators=None):
        self.mode = mode
        self.title = title or 'Selection'
        self.kind = kind or 'Object'
        self.message = message or ''
        self.component = component
        self.include_user = include_user
        self.bodies = bodies or []
        self.sketch = sketch
        self.creators = creators or []


def empty_payload(message):
    return {
        'designName': '',
        'userParameters': [],
        'components': [],
        'selections': [],
        'emptySelection': True,
        'defaultLengthUnit': '',
        'error': message or '',
    }


def build_payload(app, ui):
    design = _active_design(app)
    if not design:
        return empty_payload('Open a design to edit parameters.')

    catalog = _collect(design)
    selections = _selected_sections(ui, design, catalog)
    return {
        'designName': _design_name(app, design),
        'defaultLengthUnit': _default_length_unit(design),
        'userParameters': [record.data for record in catalog.user_parameters],
        'components': [_publish_component(bucket) for bucket in catalog.components],
        'selections': selections,
        'emptySelection': len(selections) == 0,
        'error': '',
    }


def apply_edit(app, name, expression=None, comment=None):
    design = _active_design(app)
    if not design:
        return 'Open a design to edit parameters.'
    if not name:
        return 'Parameter name is missing.'

    try:
        param = design.allParameters.itemByName(name)
    except Exception:
        param = None
    if not param:
        return 'Parameter "{}" was not found.'.format(name)

    try:
        if expression is not None:
            expression = str(expression).strip()
            if expression == '':
                return 'Enter an expression.'
            if expression != (_get(param, 'expression', '') or ''):
                param.expression = expression
        if comment is not None and str(comment) != (_get(param, 'comment', '') or ''):
            param.comment = str(comment)
    except Exception:
        return _fusion_error(app, 'Could not update "{}". Check the expression and units.'.format(name))
    return None


def _active_design(app):
    try:
        return adsk.fusion.Design.cast(app.activeProduct)
    except Exception:
        return None


def _collect(design):
    catalog = _Catalog()
    root = _native(_get(design, 'rootComponent'))
    parameter_list = _get(design, 'allParameters')
    if not parameter_list:
        return catalog

    for param in _iter_collection(parameter_list):
        try:
            _add_parameter(catalog, design, root, param)
        except Exception:
            continue
    return catalog


def _add_parameter(catalog, design, root, param):
    try:
        if param.isValid is False:
            return
    except Exception:
        pass

    name = _get(param, 'name', '') or ''
    if not name:
        return

    data = _parameter_data(design, param)
    if not data:
        return

    user = adsk.fusion.UserParameter.cast(param)
    data['isUser'] = user is not None
    data['canDelete'] = bool(user and _get(param, 'isDeletable', False))
    if user:
        catalog.user_parameters.append(_ParamRecord(data, None))
        return

    model = adsk.fusion.ModelParameter.cast(param)
    if not model:
        return

    component = _native(_get(model, 'component')) or root
    component_bucket = _component_bucket(catalog, component, root)
    creator = None
    try:
        creator = model.createdBy
    except Exception:
        creator = None
    _place_model_parameter(catalog, component_bucket, data, creator)


def _place_model_parameter(catalog, component_bucket, data, creator):
    dimension = adsk.fusion.SketchDimension.cast(creator) if creator else None
    if dimension:
        sketch = _native(_get(dimension, 'parentSketch'))
        if sketch:
            bucket = component_bucket.object_for(
                ('sketch', id(sketch)),
                _object_name(sketch, 'Sketch'),
                'Sketch',
                sketch,
                [],
            )
            bucket.parameters.append(_ParamRecord(data, _native(dimension)))
            return

    sketch = adsk.fusion.Sketch.cast(creator) if creator else None
    if sketch:
        native_sketch = _native(sketch)
        bucket = component_bucket.object_for(
            ('sketch', id(native_sketch)),
            _object_name(sketch, 'Sketch'),
            'Sketch',
            native_sketch,
            [],
        )
        bucket.parameters.append(_ParamRecord(data, native_sketch))
        return

    feature = adsk.fusion.Feature.cast(creator) if creator else None
    if feature:
        native_feature = _native(feature)
        kind = _type_label(feature)
        bucket = component_bucket.object_for(
            ('feature', id(native_feature)),
            _object_name(feature, kind),
            kind,
            None,
            _feature_bodies(catalog, native_feature),
        )
        bucket.parameters.append(_ParamRecord(data, native_feature))
        return

    if creator:
        native_creator = _native(creator)
        kind = _type_label(creator)
        bucket = component_bucket.object_for(
            ('object', id(native_creator)),
            _object_name(creator, kind),
            kind,
            None,
            [],
        )
        bucket.parameters.append(_ParamRecord(data, native_creator))
        return

    bucket = component_bucket.object_for(
        ('other', id(component_bucket.component)),
        'Other',
        'Parameter',
        None,
        [],
    )
    bucket.parameters.append(_ParamRecord(data, None))


def _component_bucket(catalog, component, root):
    key = id(component) if component else id(root)
    existing = catalog._components.get(key)
    if existing:
        return existing
    bucket = _ComponentBucket(component, _object_name(component, 'Component'))
    catalog._components[key] = bucket
    if component is not None and _same(component, root):
        catalog.components.insert(0, bucket)
    else:
        catalog.components.append(bucket)
    return bucket


def _feature_bodies(catalog, feature):
    key = id(feature)
    cached = catalog._body_cache.get(key)
    if cached is not None:
        return cached
    bodies = []
    collection = _get(feature, 'bodies')
    if collection:
        for body in _iter_collection(collection):
            native = _native(body)
            if native:
                bodies.append(native)
    catalog._body_cache[key] = bodies
    return bodies


def _parameter_data(design, param):
    is_text = _is_text(param)
    unit = _get(param, 'unit', '') or ''
    role = ''
    model = adsk.fusion.ModelParameter.cast(param)
    if model:
        role = _display_role(_get(model, 'role', '') or '')
    return {
        'name': _get(param, 'name', '') or '',
        'expression': _get(param, 'expression', '') or '',
        'value': _format_value(design, param, is_text, unit),
        'unit': _format_unit(design, unit, is_text),
        'comment': _get(param, 'comment', '') or '',
        'role': role,
        'isText': is_text,
        'isUser': False,
        'canDelete': False,
    }


def add_user_parameter(app, name, expression, units, comment):
    design = _active_design(app)
    if not design:
        return 'Open a design to edit parameters.'
    name = (name or '').strip()
    expression = (expression or '').strip()
    units = '' if units is None else str(units)
    comment = '' if comment is None else str(comment)
    if not re.match(r'^[A-Za-z][A-Za-z0-9_]*$', name):
        return 'Parameter names start with a letter and use only letters, numbers, and underscores.'
    if not expression:
        return 'Enter an expression.'
    if units == 'Text':
        expression = _quote_text(expression)
    try:
        created = design.userParameters.add(
            name,
            adsk.core.ValueInput.createByString(expression),
            units,
            comment,
        )
    except Exception:
        return _fusion_error(app, 'Could not add "{}".'.format(name))
    if not created:
        return _fusion_error(app, 'Could not add "{}".'.format(name))
    return None


def delete_parameter(app, name):
    design = _active_design(app)
    if not design:
        return 'Open a design to edit parameters.'
    if not name:
        return 'Parameter name is missing.'
    try:
        param = design.userParameters.itemByName(name)
    except Exception:
        param = None
    if not param:
        return 'Only user parameters can be deleted. "{}" is a model parameter.'.format(name)
    if not _get(param, 'isDeletable', False):
        return '"{}" is used by other parameters or features, so it cannot be deleted.'.format(name)
    try:
        deleted = param.deleteMe()
    except Exception:
        return _fusion_error(app, 'Could not delete "{}".'.format(name))
    if deleted is False:
        return _fusion_error(app, 'Could not delete "{}".'.format(name))
    return None


def _quote_text(expression):
    if len(expression) >= 2 and expression.startswith("'") and expression.endswith("'"):
        return expression
    return "'" + expression.replace("'", "''") + "'"


def _default_length_unit(design):
    try:
        return design.fusionUnitsManager.defaultLengthUnits or ''
    except Exception:
        return ''


def _selected_sections(ui, design, catalog):
    sections = []
    for entity in _iter_selections(ui):
        match = _describe_selection(entity, design)
        if not match:
            continue
        sections.append(_publish_section(match, catalog))
    return sections


def _describe_selection(entity, design):
    occurrence = adsk.fusion.Occurrence.cast(entity)
    if occurrence:
        title = _object_name(occurrence, 'Component')
        if _get(occurrence, 'isReferencedComponent'):
            return _SelectionMatch('message', title, 'Component', REFERENCED_MESSAGE)
        return _component_match(_get(occurrence, 'component'), title, design)

    component = adsk.fusion.Component.cast(entity)
    if component:
        return _component_match(component, _object_name(component, 'Component'), design)

    body = adsk.fusion.BRepBody.cast(entity)
    if body:
        return _body_match(body, _object_name(body, 'Body'))

    face = adsk.fusion.BRepFace.cast(entity)
    if face:
        return _body_match(_get(face, 'body'), _object_name(_get(face, 'body'), 'Body'))

    edge = adsk.fusion.BRepEdge.cast(entity)
    if edge:
        return _body_match(_get(edge, 'body'), _object_name(_get(edge, 'body'), 'Body'))

    sketch = adsk.fusion.Sketch.cast(entity)
    if sketch:
        title = _object_name(sketch, 'Sketch')
        referenced = _referenced_message(sketch, title, 'Sketch')
        if referenced:
            return referenced
        return _SelectionMatch('sketch', title, 'Sketch', sketch=_native(sketch))

    profile = adsk.fusion.Profile.cast(entity)
    if profile:
        sketch = _native(_get(profile, 'parentSketch'))
        title = _object_name(sketch, 'Sketch')
        referenced = _referenced_message(sketch or profile, title, 'Sketch')
        if referenced:
            return referenced
        if sketch:
            return _SelectionMatch('sketch', title, 'Sketch', sketch=sketch)

    dimension = adsk.fusion.SketchDimension.cast(entity)
    if dimension:
        parameter = _get(dimension, 'parameter')
        title = _get(parameter, 'name', '') or 'Dimension' if parameter else 'Dimension'
        referenced = _referenced_message(dimension, title, 'Dimension')
        if referenced:
            return referenced
        if not parameter:
            return _SelectionMatch('message', 'Dimension', 'Dimension', NO_DIMENSION_MESSAGE)
        return _SelectionMatch('creators', title, 'Dimension', creators=[_native(dimension)])

    sketch_entity = adsk.fusion.SketchEntity.cast(entity)
    if sketch_entity:
        sketch = _native(_get(sketch_entity, 'parentSketch'))
        title = _object_name(sketch, 'Sketch')
        referenced = _referenced_message(sketch_entity, title, 'Sketch')
        if referenced:
            return referenced
        creators = []
        dimensions = _get(sketch_entity, 'sketchDimensions')
        if dimensions:
            for item in _iter_collection(dimensions):
                native = _native(item)
                if native:
                    creators.append(native)
        if creators:
            return _SelectionMatch('creators', title, 'Sketch', creators=creators)
        return _SelectionMatch('message', title, 'Sketch', NO_GEOMETRY_MESSAGE)

    feature = adsk.fusion.Feature.cast(entity)
    if feature:
        kind = _type_label(feature)
        title = _object_name(feature, kind)
        referenced = _referenced_message(feature, title, kind)
        if referenced:
            return referenced
        return _SelectionMatch('creators', title, kind, creators=[_native(feature)])

    for constructor in (
        adsk.fusion.ConstructionPlane,
        adsk.fusion.ConstructionAxis,
        adsk.fusion.ConstructionPoint,
    ):
        constructed = constructor.cast(entity)
        if not constructed:
            continue
        kind = _type_label(constructed)
        title = _object_name(constructed, kind)
        referenced = _referenced_message(constructed, title, kind)
        if referenced:
            return referenced
        return _SelectionMatch('creators', title, kind, creators=[_native(constructed)])

    title = _object_name(entity, _type_label(entity))
    return _SelectionMatch('message', title, _type_label(entity), NO_SELECTION_MESSAGE)


def _component_match(component, title, design):
    if not component:
        return _SelectionMatch('message', title, 'Component', NO_COMPONENT_MESSAGE)
    native = _native(component)
    root = _native(_get(design, 'rootComponent'))
    return _SelectionMatch(
        'component',
        title,
        'Component',
        component=native,
        include_user=_same(native, root),
    )


def _body_match(body, title):
    if not body:
        return _SelectionMatch('message', title or 'Body', 'Body', NO_BODY_MESSAGE)
    referenced = _referenced_message(body, title, 'Body')
    if referenced:
        return referenced
    native = _native(body)
    return _SelectionMatch('bodies', title, 'Body', bodies=[native] if native else [])


def _referenced_message(obj, title, kind):
    if not obj:
        return None
    context = _get(obj, 'assemblyContext')
    if context and _get(context, 'isReferencedComponent'):
        return _SelectionMatch('message', title, kind, REFERENCED_MESSAGE)
    return None


def _publish_section(match, catalog):
    objects = []
    user_parameters = []
    message = match.message

    if match.mode == 'component':
        bucket = _find_component(catalog, match.component)
        if bucket:
            objects = [_publish_object(obj) for obj in bucket.objects]
        if match.include_user:
            user_parameters = [record.data for record in catalog.user_parameters]
        if not objects and not user_parameters and not message:
            message = NO_COMPONENT_MESSAGE
    elif match.mode == 'bodies':
        for obj in catalog.objects():
            if _overlaps(obj.bodies, match.bodies):
                objects.append(_publish_object(obj))
        if not objects and not message:
            message = NO_BODY_MESSAGE
    elif match.mode == 'sketch':
        for obj in catalog.objects():
            if obj.sketch is not None and _same(obj.sketch, match.sketch):
                objects.append(_publish_object(obj))
        if not objects and not message:
            message = NO_SKETCH_MESSAGE
    elif match.mode == 'creators':
        for obj in catalog.objects():
            matched = [record for record in obj.parameters if _created_by_any(record, match.creators)]
            if matched:
                objects.append(_publish_object(obj, matched))
        if not objects and not message:
            message = NO_SELECTION_MESSAGE

    return {
        'title': match.title,
        'kind': match.kind,
        'message': message,
        'userParameters': user_parameters,
        'objects': objects,
    }


def _publish_component(bucket):
    return {
        'name': bucket.name,
        'objects': [_publish_object(obj) for obj in bucket.objects],
    }


def _publish_object(bucket, records=None):
    chosen = bucket.parameters if records is None else records
    return {
        'name': bucket.name,
        'kind': bucket.kind,
        'parameters': [record.data for record in chosen],
    }


def _find_component(catalog, component):
    for bucket in catalog.components:
        if _same(bucket.component, component):
            return bucket
    return None


def _overlaps(left, right):
    for item in left:
        for other in right:
            if _same(item, other):
                return True
    return False


def _created_by_any(record, creators):
    for creator in creators:
        if _same(record.created_by, creator):
            return True
    return False


def _iter_selections(ui):
    try:
        selections = ui.activeSelections
    except Exception:
        return []
    if not selections:
        return []
    entities = []
    try:
        for selection in selections:
            entity = _get(selection, 'entity')
            if entity:
                entities.append(entity)
    except Exception:
        return entities
    return entities


def _design_name(app, design):
    document = _get(app, 'activeDocument')
    name = _get(document, 'name', '') or ''
    if name:
        return name
    return _object_name(_get(design, 'rootComponent'), 'Design')


def _format_value(design, param, is_text, unit):
    if is_text:
        return _get(param, 'textValue', '') or ''
    if not unit:
        try:
            return '{:.6g}'.format(param.value)
        except Exception:
            return ''
    try:
        return design.fusionUnitsManager.formatValue(
            param.value,
            unit,
            -1,
            adsk.core.BooleanOptions.DefaultBooleanOption,
            -1,
            False,
        ) or ''
    except Exception:
        try:
            return '{:.6g}'.format(param.value)
        except Exception:
            return ''


def _format_unit(design, unit, is_text):
    if is_text:
        return 'Text'
    if not unit:
        return ''
    try:
        return design.fusionUnitsManager.formatUnits(unit) or unit
    except Exception:
        return unit


def _is_text(param):
    try:
        return param.valueType == adsk.fusion.ParameterValueTypes.TextParameterValueType
    except Exception:
        return False


def _display_role(role):
    if not role or ' ' in role:
        return role or ''
    return re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', role)


def _type_label(obj):
    try:
        object_type = obj.objectType or ''
    except Exception:
        return 'Object'
    leaf = object_type.replace('.', '::').split('::')[-1]
    if leaf.endswith('Feature'):
        leaf = leaf[:-len('Feature')]
    label = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', leaf)
    return label or 'Object'


def _object_name(obj, fallback):
    name = _get(obj, 'name', '')
    if isinstance(name, str) and name.strip():
        return name
    return fallback


def _fusion_error(app, fallback):
    try:
        _code, message = app.getLastError()
    except Exception:
        message = ''
    if isinstance(message, str) and message.strip():
        return message.strip()
    return fallback


def _native(obj):
    if obj is None:
        return None
    try:
        native = obj.nativeObject
    except Exception:
        return obj
    return native or obj


def _same(left, right):
    if left is None or right is None:
        return False
    native_left = _native(left)
    native_right = _native(right)
    for first, second in ((left, right), (native_left, native_right), (native_left, right), (left, native_right)):
        try:
            if first == second:
                return True
        except Exception:
            continue
    return False


def _get(obj, attr, default=None):
    if obj is None:
        return default
    try:
        value = getattr(obj, attr)
    except Exception:
        return default
    if value is None:
        return default
    return value


def _collection_count(collection):
    try:
        return collection.count
    except Exception:
        pass
    try:
        return len(collection)
    except Exception:
        return 0


def _iter_collection(collection):
    if not collection:
        return
    count = _collection_count(collection)
    if count:
        for index in range(count):
            try:
                item = collection.item(index)
            except Exception:
                item = None
            if item:
                yield item
        return
    try:
        for item in collection:
            if item:
                yield item
    except Exception:
        return
