/*
 * fusionBridge
 * -------------
 * Typed request/response between the React palette and the Fusion add-in.
 * Outside Fusion (vite dev), an in-memory mock keeps the palette interactive.
 */

import type {
  JointInfo,
  JointList,
  JointSelection,
  ReadyPayload,
  SketchConstraint,
  SketchList,
  SketchSelection,
} from '../types/types';

export type FusionResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export class FusionError extends Error {}

type EventListener = (data: string) => void;

const eventListeners = new Map<string, Set<EventListener>>();

function dispatchEvent(action: string, messageString: string): string {
  const listeners = eventListeners.get(action);
  if (listeners) {
    listeners.forEach((callback) => {
      try {
        callback(messageString);
      } catch (error) {
        console.error(`[CONstrainer] event listener for "${action}" threw`, error);
      }
    });
  }
  return 'OK';
}

export function onEvent(action: string, callback: EventListener): () => void {
  let set = eventListeners.get(action);
  if (!set) {
    set = new Set();
    eventListeners.set(action, set);
  }
  set.add(callback);
  return () => {
    set?.delete(callback);
  };
}

function installHandler() {
  window.fusionJavaScriptHandler = {
    handle: (action: string, messageString: string) => {
      if (action === 'debugger') {
        debugger;
        return 'OK';
      }
      return dispatchEvent(action, messageString);
    },
  };
}

const MAX_WAIT_MS = 1000;

export function hasAdsk(): boolean {
  return !!(window.adsk && typeof window.adsk.fusionSendData === 'function');
}

let readyPromise: Promise<boolean> | null = null;

export function waitForAdsk(): Promise<boolean> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<boolean>((resolve) => {
    if (hasAdsk()) {
      installHandler();
      resolve(true);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (hasAdsk()) {
        window.clearInterval(timer);
        installHandler();
        resolve(true);
      } else if (Date.now() - startedAt > MAX_WAIT_MS) {
        window.clearInterval(timer);
        console.log('[CONstrainer] adsk object not found; running in dev mock mode.');
        resolve(false);
      }
    }, 100);
  });
  return readyPromise;
}

installHandler();

export async function request<T = unknown>(action: string, payload?: unknown): Promise<T> {
  if (!hasAdsk()) {
    return mockRequest<T>(action, payload);
  }

  const raw = await Promise.resolve(window.adsk!.fusionSendData(action, JSON.stringify(payload ?? {})));
  if (raw == null || raw === '') {
    throw new FusionError(`Empty response from Fusion for "${action}"`);
  }

  let parsed: FusionResponse<T>;
  try {
    parsed = JSON.parse(raw) as FusionResponse<T>;
  } catch {
    return raw as unknown as T;
  }

  if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
    if (parsed.ok) return parsed.data;
    throw new FusionError(parsed.error || `Request "${action}" failed`);
  }

  return parsed as unknown as T;
}

export function send(action: string, payload?: unknown): void {
  try {
    if (hasAdsk()) {
      void window.adsk!.fusionSendData(action, JSON.stringify(payload ?? {}));
    }
  } catch (error) {
    console.error(`[CONstrainer] send("${action}") failed`, error);
  }
}

export function sendJsLog(level: string, message: unknown, extra?: unknown): void {
  send('jsLog', {
    level: level || 'info',
    message: String(message ?? ''),
    extra: extra ?? null,
    ts: new Date().toISOString(),
  });
}

export async function sendReady(): Promise<ReadyPayload> {
  await waitForAdsk();
  return request<ReadyPayload>('ready');
}

// ---------------------------------------------------------------------------
// Dev mock
// ---------------------------------------------------------------------------

const LINE_A = 'ent-line-a';
const LINE_B = 'ent-line-b';

let mockSketches: SketchList = {
  components: [
    {
      name: 'Root',
      token: 'comp-root',
      sketches: [
        {
          name: 'Profile',
          token: 'sk-profile',
          isFullyConstrained: true,
          constraints: [
            {
              token: 'c-coincident',
              sketchToken: 'sk-profile',
              index: 0,
              type: 'coincident',
              label: 'Coincident',
              isDeletable: true,
              entities: [
                { role: 'point', kind: 'point', label: 'Point', token: 'ent-pt-1' },
                { role: 'entity', kind: 'line', label: 'Line', token: 'ent-line-c' },
              ],
            },
            {
              token: 'c-horizontal',
              sketchToken: 'sk-profile',
              index: 1,
              type: 'horizontal',
              label: 'Horizontal',
              isDeletable: true,
              entities: [{ role: 'line', kind: 'line', label: 'Line', token: 'ent-line-c' }],
            },
          ],
        },
        {
          name: 'Slot',
          token: 'sk-slot',
          isFullyConstrained: false,
          constraints: [
            {
              token: 'c-parallel',
              sketchToken: 'sk-slot',
              index: 0,
              type: 'parallel',
              label: 'Parallel',
              isDeletable: false,
              entities: [
                { role: 'lineOne', kind: 'line', label: 'Line', token: LINE_A },
                { role: 'lineTwo', kind: 'line', label: 'Line', token: LINE_B },
              ],
            },
            {
              token: 'c-vertical',
              sketchToken: 'sk-slot',
              index: 1,
              type: 'vertical',
              label: 'Vertical',
              isDeletable: true,
              entities: [{ role: 'line', kind: 'line', label: 'Line', token: LINE_A }],
            },
          ],
        },
      ],
    },
    {
      name: 'Bracket',
      token: 'comp-bracket',
      sketches: [
        {
          name: 'Holes',
          token: 'sk-holes',
          isFullyConstrained: false,
          constraints: [
            {
              token: 'c-concentric',
              sketchToken: 'sk-holes',
              index: 0,
              type: 'concentric',
              label: 'Concentric',
              isDeletable: true,
              entities: [
                { role: 'entityOne', kind: 'circle', label: 'Circle', token: 'ent-circ-1' },
                { role: 'entityTwo', kind: 'circle', label: 'Circle', token: 'ent-circ-2' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

let mockJoints: JointInfo[] = [
  {
    token: 'j-hinge',
    name: 'Hinge',
    motion: 'revolute',
    motionLabel: 'Revolute',
    sideOne: 'Bracket:1',
    sideTwo: 'Base:1',
    isAsBuilt: false,
    isSuppressed: false,
    component: 'Root',
  },
  {
    token: 'j-weld',
    name: 'Weld',
    motion: 'rigid',
    motionLabel: 'Rigid',
    sideOne: 'Cover:1',
    sideTwo: 'Base:1',
    isAsBuilt: true,
    isSuppressed: false,
    component: 'Root',
  },
  {
    token: 'j-slide',
    name: 'Drawer',
    motion: 'slider',
    motionLabel: 'Slider',
    sideOne: 'Drawer:1',
    sideTwo: 'Cabinet:1',
    isAsBuilt: false,
    isSuppressed: true,
    component: 'Root',
  },
];

const mockSketchSelection: SketchSelection = {
  sketchName: 'Slot',
  sketchToken: 'sk-slot',
  entities: [
    { role: '', kind: 'line', label: 'Line', token: LINE_A },
    { role: '', kind: 'line', label: 'Line', token: LINE_B },
  ],
  compatible: [
    { type: 'collinear', label: 'Collinear', entityTokens: [LINE_A, LINE_B] },
    { type: 'parallel', label: 'Parallel', entityTokens: [LINE_A, LINE_B] },
    { type: 'perpendicular', label: 'Perpendicular', entityTokens: [LINE_A, LINE_B] },
    { type: 'equal', label: 'Equal', entityTokens: [LINE_A, LINE_B] },
  ],
  error: null,
};

const mockJointSelection: JointSelection = {
  geometries: [
    { label: 'Planar face', token: 'geo-face-1', kind: 'planarFace' },
    { label: 'Face', token: 'geo-face-2', kind: 'face' },
  ],
  occurrences: [
    { name: 'Bracket:1', token: 'occ-bracket' },
    { name: 'Base:1', token: 'occ-base' },
  ],
  canCreateJoint: true,
  canCreateAsBuilt: true,
  motions: [
    { type: 'rigid', label: 'Rigid', valueKind: 'none' },
    { type: 'revolute', label: 'Revolute', valueKind: 'angle' },
    { type: 'slider', label: 'Slider', valueKind: 'distance' },
    { type: 'cylindrical', label: 'Cylindrical', valueKind: 'angle' },
    { type: 'pinSlot', label: 'Pin-slot', valueKind: 'distance' },
    { type: 'planar', label: 'Planar', valueKind: 'angle' },
    { type: 'ball', label: 'Ball', valueKind: 'none' },
  ],
  error: null,
};

const MOTION_LABELS: Record<string, string> = {
  rigid: 'Rigid',
  revolute: 'Revolute',
  slider: 'Slider',
  cylindrical: 'Cylindrical',
  pinSlot: 'Pin-slot',
  planar: 'Planar',
  ball: 'Ball',
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function mockRequest<T>(action: string, payload?: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const body = (payload ?? {}) as Record<string, unknown>;

  switch (action) {
    case 'ready':
      return { doc: 'Sample Design' } as T;
    case 'palette:minimize':
      return { minimized: true, dev: true } as T;
    case 'jsLog':
      return undefined as T;
    case 'sketch:list':
      return clone(mockSketches) as T;
    case 'sketch:readSelection':
      return clone(mockSketchSelection) as T;
    case 'sketch:select':
      return { selected: 1, highlighted: 1 } as T;
    case 'sketch:highlight':
      return { highlighted: 1 } as T;
    case 'sketch:clearHighlight':
      return { cleared: true } as T;
    case 'sketch:delete': {
      const token = String(body.token ?? '');
      let removed: SketchConstraint | undefined;
      for (const group of mockSketches.components) {
        for (const sketch of group.sketches) {
          const index = sketch.constraints.findIndex((item) => item.token === token);
          if (index >= 0) {
            removed = sketch.constraints[index];
            if (!removed.isDeletable) throw new FusionError('This constraint cannot be deleted.');
            sketch.constraints.splice(index, 1);
          }
        }
      }
      if (!removed) throw new FusionError('That constraint is no longer in the design.');
      return { sketchToken: '', label: removed.label } as T;
    }
    case 'sketch:add': {
      const type = String(body.type ?? '');
      const tokens = (body.entityTokens as string[]) ?? [];
      if (type === 'parallel' && tokens.includes(LINE_A) && tokens.includes(LINE_B)) {
        const slot = mockSketches.components[0].sketches[1];
        if (slot.constraints.some((item) => item.type === 'parallel')) {
          throw new FusionError('A parallel constraint already exists between these lines.');
        }
      }
      const option = mockSketchSelection.compatible.find((item) => item.type === type);
      const sketch = mockSketches.components
        .flatMap((group) => group.sketches)
        .find((item) => item.token === mockSketchSelection.sketchToken);
      if (!sketch || !option) throw new FusionError('That constraint cannot be added to this selection.');
      const created: SketchConstraint = {
        token: `c-${Date.now()}`,
        sketchToken: sketch.token,
        index: sketch.constraints.length,
        type,
        label: option.label,
        isDeletable: true,
        entities: mockSketchSelection.entities.map((entity, index) => ({
          ...entity,
          role: `entity${index + 1}`,
        })),
      };
      sketch.constraints.push(created);
      return { sketchToken: sketch.token, constraint: created } as T;
    }
    case 'joint:list':
      return { joints: clone(mockJoints) } as JointList as T;
    case 'joint:readSelection':
      return clone(mockJointSelection) as T;
    case 'joint:select':
      return { selected: 1 } as T;
    case 'joint:delete': {
      const token = String(body.token ?? '');
      const index = mockJoints.findIndex((item) => item.token === token);
      if (index < 0) throw new FusionError('That joint is no longer in the design.');
      const [removed] = mockJoints.splice(index, 1);
      return { name: removed.name } as T;
    }
    case 'joint:rename': {
      const token = String(body.token ?? '');
      const name = String(body.name ?? '').trim();
      if (!name) throw new FusionError('Name is required.');
      const joint = mockJoints.find((item) => item.token === token);
      if (!joint) throw new FusionError('That joint is no longer in the design.');
      joint.name = name;
      return clone(joint) as T;
    }
    case 'joint:setSuppressed': {
      const token = String(body.token ?? '');
      const joint = mockJoints.find((item) => item.token === token);
      if (!joint) throw new FusionError('That joint is no longer in the design.');
      joint.isSuppressed = Boolean(body.suppressed);
      return clone(joint) as T;
    }
    case 'joint:add': {
      const motion = String(body.motion ?? 'rigid');
      const asBuilt = Boolean(body.asBuilt);
      const created: JointInfo = {
        token: `j-${Date.now()}`,
        name: asBuilt ? 'As-built joint' : 'Joint',
        motion,
        motionLabel: MOTION_LABELS[motion] ?? 'Joint',
        sideOne: mockJointSelection.occurrences[0]?.name ?? 'Root',
        sideTwo: mockJointSelection.occurrences[1]?.name ?? 'Root',
        isAsBuilt: asBuilt,
        isSuppressed: false,
        component: 'Root',
      };
      mockJoints.push(created);
      return clone(created) as T;
    }
    default:
      throw new FusionError(`Unknown action: ${action}`);
  }
}
