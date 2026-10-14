import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { checkADSK } from '../connector/fusionReceiver';
import type { ProProject } from '../types/types';
import { Projects } from './Projects/Projects';
import { ParametersTable } from './ParametersTable/ParametersTable';

function fusionSend(action: string, data: unknown) {
  try {
    if (window.adsk && typeof window.adsk.fusionSendData === 'function') {
      return window.adsk.fusionSendData(action, typeof data === 'string' ? data : JSON.stringify(data));
    }
    // Keep UI alive even when not hosted in Fusion.
    // eslint-disable-next-line no-console
    console.log(`[ProParams] adsk not ready yet; dropping message "${action}"`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

function sendJsLog(level: string, message: unknown, extra?: unknown) {
  const payload = {
    level: level || 'info',
    message: String(message ?? ''),
    extra: extra ?? null,
    ts: new Date().toISOString(),
  };
  fusionSend('jsLog', payload);
}

export default function App() {
  const [projects, setProjects] = useState<ProProject[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState<number>(-1);

  const readySentRef = useRef(false);

  const selectedProject = useMemo(() => {
    if (currentProjectIndex < 0 || currentProjectIndex >= projects.length) return null;
    return projects[currentProjectIndex];
  }, [projects, currentProjectIndex]);

  const saveData = useCallback(
    (nextProjects: ProProject[]) => {
      fusionSend('saveData', nextProjects);
    },
    []
  );

  const handleLoadData = useCallback((data: string) => {
    const parsed = JSON.parse(data) as ProProject[];
    setProjects(parsed);
    // Match OLD_JS behavior: load data but do not auto-select a project.
    setCurrentProjectIndex(-1);
  }, []);

  const handleFusionMessage = useCallback(
    (action: string, messageString: string) => {
      try {
        if (action === 'loadData') {
          handleLoadData(messageString);
        } else if (action === 'debugger') {
          debugger;
        } else {
          return `Unexpected command type: ${action}`;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        sendJsLog('error', 'Exception in fusionJavaScriptHandler.handle', {
          action,
          data: messageString,
          error: String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
      }
      return 'OK';
    },
    [handleLoadData]
  );

  useEffect(() => {
    // Install Fusion handler (also retries until window.adsk exists).
    checkADSK(handleFusionMessage);

    const onError = (ev: ErrorEvent) => {
      try {
        sendJsLog('error', ev.message || 'window.error', {
          filename: ev.filename,
          lineno: ev.lineno,
          colno: ev.colno,
          stack: ev.error?.stack,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    };

    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      try {
        const reason = ev.reason;
        sendJsLog('error', 'Unhandled promise rejection', {
          reason: String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // Handshake once adsk appears (mirrors OLD_JS behavior).
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const hasAdsk = !!(window.adsk && typeof window.adsk.fusionSendData === 'function');
      if (hasAdsk && !readySentRef.current) {
        readySentRef.current = true;
        window.clearInterval(timer);
        sendJsLog('info', 'adsk ready; sending handshake');
        fusionSend('ready', {});
        return;
      }

      if (!hasAdsk && Date.now() - startedAt > 15000) {
        window.clearInterval(timer);
        // eslint-disable-next-line no-console
        console.log('[ProParams] adsk object not found after 15s');
      }
    }, 100);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.clearInterval(timer);
    };
  }, [handleFusionMessage]);

  const selectProject = useCallback((index: number) => {
    setCurrentProjectIndex(index);
  }, []);

  const onCreateProject = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      if (projects.some((p) => p.name === trimmed)) {
        window.alert('Project name must be unique!');
        return;
      }

      const next: ProProject[] = [...projects, { name: trimmed, params: [] }];
      setProjects(next);
      saveData(next);
      setCurrentProjectIndex(next.length - 1);
    },
    [projects, saveData]
  );

  const onDeleteProject = useCallback(
    (index: number) => {
      if (!window.confirm('Delete this project?')) return;
      const next = projects.slice();
      next.splice(index, 1);
      setProjects(next);
      saveData(next);
      setCurrentProjectIndex((cur) => {
        if (cur === index) return -1;
        if (cur > index) return cur - 1;
        return cur;
      });
    },
    [projects, saveData]
  );

  const syncToFusion = useCallback(() => {
    if (!selectedProject) return;
    fusionSend('syncProject', selectedProject);
  }, [selectedProject]);

  const onProjectsChange = useCallback(
    (nextProjects: ProProject[]) => {
      setProjects(nextProjects);
      saveData(nextProjects);
    },
    [saveData]
  );

  return (
    <div className="pp_container">
      <Projects
        projects={projects}
        currentProjectIndex={currentProjectIndex}
        onSelectProject={selectProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />

      {!!selectedProject && (
        <ParametersTable
          projects={projects}
          currentProjectIndex={currentProjectIndex}
          selectedProject={selectedProject}
          onProjectsChange={onProjectsChange}
          onSyncProject={syncToFusion}
        />
      )}
    </div>
  );
}