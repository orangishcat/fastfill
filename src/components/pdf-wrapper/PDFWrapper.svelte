<!-- src/components/PdfViewer.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    EmbedPdfContainer,
    PDFViewer,
    type PluginRegistry,
  } from '@embedpdf/svelte-pdf-viewer';

  import { centerNavbar, destroyNavbarObserver, injectGridCss } from './fix-ui';
  import { fileAccessReady, fileAccessDestroy } from './file-access';
  import { createLogger } from '../../lib/logger';
  export let src: string | undefined = undefined;

  const log = createLogger('pdf:viewer');

  const onInit = (container: EmbedPdfContainer) => {
    log.debug('Viewer initialized');
    injectGridCss(container);
  }

  const onReady = (registry: PluginRegistry) => {
    log.info('Viewer ready');
    fileAccessReady(registry);
    centerNavbar(registry);
  }

  onDestroy(() => {
    fileAccessDestroy();
    destroyNavbarObserver();
    log.debug('Viewer destroyed');
  });
</script>

<div class="viewer">
  <PDFViewer
    config={{
      src,
      theme: {
        preference: 'dark'
      },
      ui: {
        disabledCategories: ['insert']
      }
    }}
    oninit={onInit}
    onready={onReady}
    class="w-full h-screen"
  />
</div>
