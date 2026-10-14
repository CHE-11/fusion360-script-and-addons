import { IconMinus } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { onEvent, request, sendJsLog, sendReady, waitForAdsk } from '../connector/fusionBridge';
import {
  EMPTY_JOINT_SELECTION,
  EMPTY_SKETCH_SELECTION,
  type JointSelection,
  type SelectionChangedPayload,
  type SketchSelection,
  type TabId,
} from '../types/types';
import { JointTab } from './JointTab/JointTab';
import { SketchTab } from './SketchTab/SketchTab';
import { Tabs } from './Tabs/Tabs';
import { ToastProvider, useToast } from './common/Toast';

function AppShell() {
  const { showToast } = useToast();
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<TabId>('sketches');
  const [docName, setDocName] = useState('');
  const [revision, setRevision] = useState(0);
  const [sketchSelection, setSketchSelection] = useState<SketchSelection>(EMPTY_SKETCH_SELECTION);
  const [jointSelection, setJointSelection] = useState<JointSelection>(EMPTY_JOINT_SELECTION);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      sendJsLog('error', event.message || 'window.error', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      sendJsLog('error', 'Unhandled promise rejection', {
        reason: String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    void waitForAdsk().then(() => setBooted(true));

    void sendReady()
      .then((ready) => setDocName(ready?.doc ?? ''))
      .catch((error) => {
        showToast(error instanceof Error ? error.message : 'Could not reach Fusion.', 'error');
      });

    const offDoc = onEvent('docActivated', (raw) => {
      try {
        const data = JSON.parse(raw) as { name?: string };
        setDocName(data.name ?? '');
      } catch {
        setDocName('');
      }
      setRevision((value) => value + 1);
    });
    const offSelection = onEvent('selectionChanged', (raw) => {
      try {
        const data = JSON.parse(raw) as SelectionChangedPayload;
        if (data.sketch) setSketchSelection(data.sketch);
        if (data.joint) setJointSelection(data.joint);
      } catch {
        // Ignore a malformed push from the add-in.
      }
    });

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      offDoc();
      offSelection();
    };
  }, [showToast]);

  useEffect(() => {
    if (!booted) return;
    let cancelled = false;
    void request<SketchSelection>('sketch:readSelection')
      .then((next) => {
        if (!cancelled) setSketchSelection(next);
      })
      .catch(() => {
        if (!cancelled) setSketchSelection(EMPTY_SKETCH_SELECTION);
      });
    void request<JointSelection>('joint:readSelection')
      .then((next) => {
        if (!cancelled) setJointSelection(next);
      })
      .catch(() => {
        if (!cancelled) setJointSelection(EMPTY_JOINT_SELECTION);
      });
    return () => {
      cancelled = true;
    };
  }, [booted]);

  const minimize = async () => {
    try {
      const result = await request<{ minimized?: boolean; dev?: boolean }>('palette:minimize');
      if (result?.dev) showToast('In Fusion this hides the palette.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not hide the palette.', 'error');
    }
  };

  return (
    <div id="cs_app" className="cs_app">
      <Tabs active={tab} onChange={setTab} />
      <main id="cs_main" className="cs_main">
        <SketchTab
          booted={booted}
          active={tab === 'sketches'}
          revision={revision}
          selection={sketchSelection}
          onSelection={setSketchSelection}
        />
        <JointTab
          booted={booted}
          active={tab === 'joints'}
          revision={revision}
          selection={jointSelection}
          onSelection={setJointSelection}
        />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
