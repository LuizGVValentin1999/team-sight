'use client';

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

type ExportSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
};

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function triggerBlobDownload(input: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(input.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function collectStyleTags() {
  const chunks: string[] = [];

  for (const styleSheet of Array.from(document.styleSheets)) {
    try {
      const cssRules = styleSheet.cssRules;

      if (!cssRules) {
        continue;
      }

      for (const rule of Array.from(cssRules)) {
        chunks.push(rule.cssText);
      }
    } catch {
      // Ignora stylesheets inacessíveis por CORS.
    }
  }

  return chunks.join('\n');
}

export async function exportElementAsPdf(input: {
  element: HTMLElement;
  fileBaseName: string;
}) {
  const canvas = await html2canvas(input.element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    windowWidth: input.element.scrollWidth,
    windowHeight: input.element.scrollHeight
  });

  const imageData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const drawableWidth = pageWidth - margin * 2;
  const drawableHeight = pageHeight - margin * 2;
  const imageHeight = (canvas.height * drawableWidth) / canvas.width;

  let heightLeft = imageHeight;
  let position = margin;

  pdf.addImage(imageData, 'PNG', margin, position, drawableWidth, imageHeight);
  heightLeft -= drawableHeight;

  while (heightLeft > 0) {
    position = margin - (imageHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imageData, 'PNG', margin, position, drawableWidth, imageHeight);
    heightLeft -= drawableHeight;
  }

  pdf.save(`${safeFileName(input.fileBaseName || 'export') || 'export'}-${timestamp()}.pdf`);
}

export function exportElementAsHtml(input: {
  element: HTMLElement;
  title: string;
  fileBaseName: string;
}) {
  const styles = collectStyleTags();
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>${styles}</style>
  </head>
  <body>
    ${input.element.outerHTML}
  </body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerBlobDownload({
    blob,
    fileName: `${safeFileName(input.fileBaseName || 'export') || 'export'}-${timestamp()}.html`
  });
}

export function exportSheetsAsExcel(input: {
  sheets: ExportSheet[];
  fileBaseName: string;
}) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of input.sheets) {
    const rows = sheet.rows.length > 0 ? sheet.rows : [{ mensagem: 'Sem dados para exportar' }];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(
    workbook,
    `${safeFileName(input.fileBaseName || 'export') || 'export'}-${timestamp()}.xlsx`
  );
}

