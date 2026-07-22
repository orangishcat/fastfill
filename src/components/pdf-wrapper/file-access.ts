import {
  type Command,
  type CommandsCapability,
  type DocumentManagerCapability,
  type EmbedPdfContainer,
  type ExportCapability,
  type HistoryCapability,
  type PluginRegistry,
} from '@embedpdf/svelte-pdf-viewer';

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
let toolbarObserver: MutationObserver | undefined;

export const fileAccessInit = (container: EmbedPdfContainer) => {
  const root = container.shadowRoot;
  if (!root) return;

  const applyMainToolbarLayout = () => {
    if (!root.querySelector('[data-fastfill-toolbar-layout]')) {
      const styles = document.createElement('style');
      styles.dataset.fastfillToolbarLayout = '';
      styles.textContent = `
        .grid\\! { display: grid !important; }
        .grid-cols-3\\! {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }
      `;
      root.append(styles);
    }

    const toolbar = root.querySelector(
      '[data-epdf-i="main-toolbar"]'
    );
    toolbar?.classList.add('grid!', 'grid-cols-3!');
  };

  toolbarObserver?.disconnect();
  applyMainToolbarLayout();
  toolbarObserver = new MutationObserver(applyMainToolbarLayout);
  toolbarObserver.observe(root, { childList: true, subtree: true });
};

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
  if (!commands || !documentManager || !exporter || !history) return;

  const saveDocument = async (documentId: string) => {
    const handle = fileHandles.get(documentId);
    if (!handle) return;

    try {
      const buffer = await exporter
        .forDocument(documentId)
        .saveAsCopy()
        .toPromise();
      const writable = await handle.createWritable();
      await writable.write(buffer);
      await writable.close();
    } catch (error) {
      console.error('Unable to autosave PDF', error);
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
    if (!fileHandles.has(documentId)) return;

    const pendingTimer = autosaveTimers.get(documentId);
    if (pendingTimer) clearTimeout(pendingTimer);

    autosaveTimers.set(
      documentId,
      setTimeout(() => {
        autosaveTimers.delete(documentId);
        enqueueAutosave(documentId);
      }, AUTOSAVE_DELAY_MS)
    );
  };

  const openDocument: Command['action'] = async () => {
    const browserWindow = window as FilePickerWindow;
    if (!browserWindow.showOpenFilePicker) {
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
      const response = await documentManager
        .openDocumentBuffer({
          buffer: await file.arrayBuffer(),
          name: file.name
        })
        .toPromise();
      await response.task.toPromise();
      if (canWrite) fileHandles.set(response.documentId, handle);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Unable to open PDF', error);
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
    })
  );
};

export const fileAccessDestroy = () => {
  toolbarObserver?.disconnect();
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  autosaveTimers.forEach((timer) => clearTimeout(timer));
}
