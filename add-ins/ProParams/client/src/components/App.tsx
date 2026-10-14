import { useEffect, useState } from 'react';

import { sendJsLog, sendReady } from '../connector/fusionBridge';
import type { TabId } from '../types/types';
import { FeatureTab } from './FeatureTab/FeatureTab';
import { GlobalTab } from './GlobalTab/GlobalTab';
import { ProjectTab } from './ProjectTab/ProjectTab';
import { Tabs } from './Tabs/Tabs';
import { ToastProvider } from './common/Toast';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('global');

  useEffect(() => {
    // Handshake with the Fusion add-in so it can push data to us.
    void sendReady();

    const onError = (ev: ErrorEvent) => {
      sendJsLog('error', ev.message || 'window.error', {
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        stack: ev.error?.stack,
      });
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      sendJsLog('error', 'Unhandled promise rejection', {
        reason: String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <ToastProvider>
      <div id="pp_app" className="pp_app">

        <Tabs active={activeTab} onChange={setActiveTab} />

        <main id="pp_main" className="pp_main">
          {activeTab === 'global' && <GlobalTab />}
          {activeTab === 'project' && <ProjectTab />}
          {activeTab === 'feature' && <FeatureTab />}
        </main>
      </div>
    </ToastProvider>
  );
}
