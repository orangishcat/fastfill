import {
  type Command,
  type CommandsCapability,
  type DocumentManagerCapability,
  type ExportCapability,
  type HistoryCapability,
  type PluginRegistry,
} from '@embedpdf/svelte-pdf-viewer';
import { createLogger } from '../../lib/logger';

const AUTOSAVE_DELAY_MS = 1500;
const OPEN_COMMAND_ID = 'document:open';
const WRITE_PERMISSION_OPTIONS = { mode: 'readwrite' } as const;
const PDF_PICKER_OPTIONS = {
  id: 'fastfill-pdf',
  multiple: false,
  types: [
    {
      description: 'PDF documents',
      accept: { 'application/pdf': ['.pdf'] }
    }
  ]
};
const log = createLogger('pdf:file-access');

type WritableFileHandle = FileSystemFileHandle & {
  queryPermission: (
    options: typeof WRITE_PERMISSION_OPTIONS
  ) => Promise<PermissionState>;
  requestPermission: (
    options: typeof WRITE_PERMISSION_OPTIONS
  ) => Promise<PermissionState>;
};

type FilePickerWindow = Window & {
  showOpenFilePicker?: (
    options: typeof PDF_PICKER_OPTIONS
  ) => Promise<WritableFileHandle[]>;
};


const fileHandles = new Map<string, WritableFileHandle>();
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const saveQueues = new Map<string, Promise<void>>();
const unsubscribers: Array<() => void> = [];

export const fileAccessReady = (registry: PluginRegistry) => {
  const commands = registry.getPlugin('commands')?.provides?.() as
    | CommandsCapability
    | undefined;
  const documentManager = registry
    .getPlugin('document-manager')
    ?.provides?.() as DocumentManagerCapability | undefined;
  const exporter = registry.getPlugin('export')?.provides?.() as
    | ExportCapability
    | undefined;
  const history = registry.getPlugin('history')?.provides?.() as
    | HistoryCapability
    | undefined;
  if (!commands || !documentManager || !exporter || !history) {
    log.warn(
      {
        commands: Boolean(commands),
        documentManager: Boolean(documentManager),
        exporter: Boolean(exporter),
        history: Boolean(history)
      },
      'File access initialization skipped because capabilities are missing'
    );
    return;
  }

  log.debug('Initializing file access and autosave');

  const saveDocument = async (documentId: string) => {
    const handle = fileHandles.get(documentId);
    if (!handle) return;

    try {
      log.debug({ documentId }, 'Autosave started');
      const buffer = await exporter
        .forDocument(documentId)
        .saveAsCopy()
        .toPromise();
      const writable = await handle.createWritable();
      await writable.write(buffer);
      await writable.close();
      log.debug({ documentId, bytes: buffer.byteLength }, 'Autosave completed');
    } catch (error) {
      log.error({ documentId, error }, 'Autosave failed');
    }
  };

  const enqueueAutosave = (documentId: string) => {
    const pendingSave = saveQueues.get(documentId) ?? Promise.resolve();
    const nextSave = pendingSave.then(() => saveDocument(documentId));
    saveQueues.set(documentId, nextSave);
    void nextSave.finally(() => {
      if (saveQueues.get(documentId) === nextSave) {
        saveQueues.delete(documentId);
      }
    });
  };

  const scheduleAutosave = (documentId: string) => {
    if (!fileHandles.has(documentId)) {
      log.debug({ documentId }, 'Autosave skipped without a writable file');
      return;
    }

    const pendingTimer = autosaveTimers.get(documentId);
    if (pendingTimer) clearTimeout(pendingTimer);

    autosaveTimers.set(
      documentId,
      setTimeout(() => {
        autosaveTimers.delete(documentId);
        enqueueAutosave(documentId);
      }, AUTOSAVE_DELAY_MS)
    );
    log.debug(
      { documentId, delayMs: AUTOSAVE_DELAY_MS },
      'Autosave scheduled'
    );
  };

  const openDocument: Command['action'] = async () => {
    const browserWindow = window as FilePickerWindow;
    if (!browserWindow.showOpenFilePicker) {
      log.info('File System Access API unavailable; using viewer file dialog');
      documentManager.openFileDialog();
      return;
    }

    try {
      const [handle] = await browserWindow.showOpenFilePicker(
        PDF_PICKER_OPTIONS
      );
      const canWrite =
        (await handle.queryPermission(WRITE_PERMISSION_OPTIONS)) ===
          'granted' ||
        (await handle.requestPermission(WRITE_PERMISSION_OPTIONS)) ===
          'granted';
      const file = await handle.getFile();
      log.debug(
        { fileName: file.name, fileSize: file.size, canWrite },
        'Opening selected PDF'
      );
      const response = await documentManager
        .openDocumentBuffer({
          buffer: await file.arrayBuffer(),
          name: file.name
        })
        .toPromise();
      await response.task.toPromise();
      if (canWrite) {
        fileHandles.set(response.documentId, handle);
      } else {
        log.warn(
          { documentId: response.documentId },
          'PDF opened without autosave because write permission was denied'
        );
      }
      log.info(
        { documentId: response.documentId, canWrite },
        'PDF opened'
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        log.debug('PDF selection canceled');
      } else {
        log.error({ error }, 'Unable to open PDF');
      }
    }
  };

  commands.unregisterCommand(OPEN_COMMAND_ID);
  commands.registerCommand({
    id: OPEN_COMMAND_ID,
    labelKey: 'document.open',
    icon: 'fileImport',
    shortcuts: ['Ctrl+O', 'Meta+O'],
    categories: ['document', 'document-open'],
    action: openDocument
  });
  log.debug({ commandId: OPEN_COMMAND_ID }, 'Open command registered');

  unsubscribers.push(
    history.onHistoryChange(({ documentId }) => {
      scheduleAutosave(documentId);
    }),
    documentManager.onDocumentClosed((documentId) => {
      const pendingTimer = autosaveTimers.get(documentId);
      if (pendingTimer) clearTimeout(pendingTimer);
      autosaveTimers.delete(documentId);
      saveQueues.delete(documentId);
      fileHandles.delete(documentId);
      log.debug({ documentId }, 'File access state cleared');
    })
  );
};

export const fileAccessDestroy = () => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  autosaveTimers.forEach((timer) => clearTimeout(timer));
  unsubscribers.length = 0;
  autosaveTimers.clear();
  saveQueues.clear();
  fileHandles.clear();
  log.debug('File access destroyed');
}
