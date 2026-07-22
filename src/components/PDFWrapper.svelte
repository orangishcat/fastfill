<!-- src/components/PdfViewer.svelte -->
<script lang="ts">
  import { PDFViewer } from '@embedpdf/svelte-pdf-viewer';

  export let src: string;
</script>

<div class="viewer">
  <PDFViewer
    config={{
      src,
      theme: {
        preference: 'dark'
      }
    }}
    style="width: 100%; height: 100%;"
  />
</div>

<style>
  .viewer {
    width: 100%;
    height: 80vh;
    min-height: 500px;
  }
</style>
