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
  export let src: string | undefined = undefined;

  const onInit = (container: EmbedPdfContainer) => {
    injectGridCss(container);
  }

  const onReady = (registry: PluginRegistry) => {
    fileAccessReady(registry);
    centerNavbar(registry);
  }

  onDestroy(() => {
    fileAccessDestroy();
    destroyNavbarObserver();
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
