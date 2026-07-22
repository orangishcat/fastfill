import {
  type PluginRegistry,
  type ToolbarItem,
  type EmbedPdfContainer,
  type UICapability
} from '@embedpdf/svelte-pdf-viewer'

let toolbarObserver: MutationObserver | undefined;

export const injectGridCss = (container: EmbedPdfContainer) => {
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

export const centerNavbar = (registry: PluginRegistry) => {
    const ui = registry.getPlugin('ui')?.provides?.() as
      | UICapability
      | undefined;
    if (!ui) return;

    const schema = ui.getSchema();
    const annotationToolbar = schema.toolbars['annotation-toolbar'];
    const insertToolbar = schema.toolbars['insert-toolbar'];
    const mainToolbar = schema.toolbars['main-toolbar'];
    if (!annotationToolbar || !insertToolbar || !mainToolbar) return;

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
    ) return;

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
  };

export const destroyNavbarObserver = () => {
  toolbarObserver?.disconnect();
}
