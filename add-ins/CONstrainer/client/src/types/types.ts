export type TabId = 'sketches' | 'joints';

export type DesignIntent = 'part' | 'assembly' | 'hybrid' | 'none';

export type DocumentContext = {
  doc: string;
  intent: DesignIntent;
  jointsAllowed: boolean;
};

export type SketchEntityRef = {
  role: string;
  kind: string;
  label: string;
  token: string;
};

export type SketchConstraint = {
  token: string;
  sketchToken: string;
  index: number;
  type: string;
  label: string;
  isDeletable: boolean;
  entities: SketchEntityRef[];
};

export type SketchInfo = {
  name: string;
  token: string;
  isFullyConstrained: boolean;
  constraints: SketchConstraint[];
};

export type SketchComponentGroup = {
  name: string;
  token: string;
  sketches: SketchInfo[];
};

export type SketchList = {
  components: SketchComponentGroup[];
};

export type CompatibleConstraint = {
  type: string;
  label: string;
  entityTokens: string[];
};

export type SketchSelection = {
  sketchName: string;
  sketchToken: string;
  entities: SketchEntityRef[];
  compatible: CompatibleConstraint[];
  error: string | null;
};

export type JointMotion = 'rigid' | 'revolute' | 'slider' | 'cylindrical' | 'pinSlot' | 'planar' | 'ball';

export type ValueKind = 'none' | 'angle' | 'distance';

export type JointInfo = {
  token: string;
  name: string;
  motion: string;
  motionLabel: string;
  sideOne: string;
  sideTwo: string;
  isAsBuilt: boolean;
  isSuppressed: boolean;
  isLightBulbOn: boolean;
  isVisible: boolean;
  valueLabel: string;
  component: string;
  componentToken: string;
};

export type JointList = {
  joints: JointInfo[];
  intent: DesignIntent;
  jointsAllowed: boolean;
};

export type JointGeometryRef = {
  label: string;
  token: string;
  kind: string;
};

export type JointOccurrenceRef = {
  name: string;
  token: string;
};

export type JointMotionOption = {
  type: JointMotion;
  label: string;
  valueKind: ValueKind;
};

export type JointSelection = {
  geometries: JointGeometryRef[];
  occurrences: JointOccurrenceRef[];
  canCreateJoint: boolean;
  canCreateAsBuilt: boolean;
  motions: JointMotionOption[];
  error: string | null;
};

export type ReadyPayload = DocumentContext;

export type SelectionChangedPayload = {
  sketch: SketchSelection;
  joint: JointSelection;
  document?: DocumentContext;
};

export const EMPTY_SKETCH_SELECTION: SketchSelection = {
  sketchName: '',
  sketchToken: '',
  entities: [],
  compatible: [],
  error: null,
};

export const EMPTY_JOINT_SELECTION: JointSelection = {
  geometries: [],
  occurrences: [],
  canCreateJoint: false,
  canCreateAsBuilt: false,
  motions: [],
  error: null,
};
