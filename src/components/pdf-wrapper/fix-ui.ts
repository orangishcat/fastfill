import {
  type PluginRegistry,
  type ToolbarItem,
  type EmbedPdfContainer,
  type UICapability
} from '@embedpdf/svelte-pdf-viewer'
import { createLogger } from '../../lib/logger';

let toolbarObserver: MutationObserver | undefined;
const log = createLogger('pdf:ui');

export const injectGridCss = (container: EmbedPdfContainer) => {
  const root = container.shadowRoot;
  if (!root) {
    log.warn('Grid styles not injected because the viewer shadow root is missing');
    return;
  }

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
      log.debug('Navbar grid styles injected');
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
  log.debug('Navbar layout observer started');
};

export const centerNavbar = (registry: PluginRegistry) => {
    const ui = registry.getPlugin('ui')?.provides?.() as
      | UICapability
      | undefined;
    if (!ui) {
      log.warn('Viewer UI customization skipped because capability is missing');
      return;
    }

    const schema = ui.getSchema();
    const annotationToolbar = schema.toolbars['annotation-toolbar'];
    const insertToolbar = schema.toolbars['insert-toolbar'];
    const mainToolbar = schema.toolbars['main-toolbar'];
    if (!annotationToolbar || !insertToolbar || !mainToolbar) {
      log.warn('Viewer UI customization skipped because toolbars are missing');
      return;
    }

    const insertButtons = insertToolbar.items.flatMap((item) =>
      item.type === 'group' && item.id === 'insert-tools'
        ? item.items
            .filter(
              (child) =>
                child.type === 'command-button' &&
                child.categories?.includes('insert')
            )
            .map((child) => ({
              ...child,
              id: `annotate-${child.id}`,
              categories: child.categories?.filter(
                (category) => category !== 'insert'
              )
            }))
        : []
    );

    ui.mergeSchema({
      toolbars: {
        'annotation-toolbar': {
          ...annotationToolbar,
          items: annotationToolbar.items.map((item) => {
            if (item.type !== 'group' || item.id !== 'annotation-tools') {
              return item;
            }

            const dividerIndex = item.items.findIndex(
              (child) => child.id === 'annotation-tools-divider-1'
            );
            const insertionIndex = dividerIndex === -1
              ? item.items.length
              : dividerIndex;

            return {
              ...item,
              items: [
                ...item.items.slice(0, insertionIndex),
                {
                  type: 'divider' as const,
                  id: 'annotation-insert-tools-divider',
                  orientation: 'vertical' as const
                },
                ...insertButtons,
                ...item.items.slice(insertionIndex)
              ]
            };
          })
        }
      }
    });
    log.debug({ insertButtonCount: insertButtons.length }, 'Annotate toolbar updated');

    const findMainItem = (id: string) =>
      mainToolbar.items.find((item) => item.id === id);
    const leftItems = ['left-group', 'divider-2', 'center-group']
      .map(findMainItem);
    const centerItems = ['mode-select-button', 'mode-tabs']
      .map(findMainItem);
    const rightGroup = findMainItem('right-group');

    if (
      leftItems.some((item) => !item) ||
      centerItems.some((item) => !item) ||
      !rightGroup
    ) {
      log.warn('Navbar customization skipped because expected items are missing');
      return;
    }

    ui.mergeSchema({
      toolbars: {
        'main-toolbar': {
          ...mainToolbar,
          items: [
            {
              type: 'group',
              id: 'main-toolbar-left',
              alignment: 'start',
              gap: 2,
              items: leftItems as ToolbarItem[]
            },
            {
              type: 'group',
              id: 'main-toolbar-center',
              alignment: 'center',
              gap: 2,
              items: centerItems as ToolbarItem[]
            },
            rightGroup
          ]
        }
      }
    });
    log.info('Viewer toolbar customization applied');
  };

export const destroyNavbarObserver = () => {
  toolbarObserver?.disconnect();
  toolbarObserver = undefined;
  log.debug('Navbar layout observer stopped');
}
