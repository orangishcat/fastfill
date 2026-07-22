<!-- src/components/PdfViewer.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    EmbedPdfContainer,
    PDFViewer,
    type PluginRegistry,
  } from '@embedpdf/svelte-pdf-viewer';

  import { centerNavbar } from './fix-ui';
  import { fileAccessInit, fileAccessReady, fileAccessDestroy } from './file-access';
  export let src: string | undefined = undefined;

  const onReady = (registry: PluginRegistry) => {
    fileAccessReady(registry);
    centerNavbar(registry);
  }

  const onInit = (container: EmbedPdfContainer) => {
    fileAccessInit(container);
  }

  onDestroy(() => {
    fileAccessDestroy();
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
