/**
 * printSheets - print one or more elements on their own pages.
 *
 * Copies the page's stylesheets and the elements' markup into a hidden iframe
 * and opens the browser print dialog there, so only the sheets print (no app
 * chrome). An element can set its own paper size with an inline
 * `@page { size: ...; margin: 0 }` style.
 */
const waitForFonts = async (doc) => {
  if (doc?.fonts?.ready) {
    try {
      await doc.fonts.ready;
    } catch {
      // Ignore font readiness errors and proceed with printing.
    }
  }
};

const waitForImages = async (doc) => {
  const images = Array.from(doc?.images || []);
  if (images.length === 0) return;
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }),
  );
};

export const printSheets = async (targets, title = "schedule") => {
  await waitForFonts(document);

  const cleanTitle = title.replace(/[^a-zA-Z0-9-_]/g, "-");
  const styles = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((node) => node.outerHTML)
    .join("\n");
  const pagesHtml = targets
    .map((target) => `<div class="export-print-page">${target.outerHTML}</div>`)
    .join("");
  const baseHref = document.baseURI || window.location.href;

  const printFrame = document.createElement("iframe");
  printFrame.style.position = "fixed";
  printFrame.style.right = "0";
  printFrame.style.bottom = "0";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.border = "0";
  printFrame.style.opacity = "0";
  printFrame.setAttribute("title", "Print frame");
  printFrame.setAttribute("aria-hidden", "true");
  document.body.appendChild(printFrame);

  const printDoc = printFrame.contentDocument;
  const printWindow = printFrame.contentWindow;
  if (!printDoc || !printWindow) {
    printFrame.remove();
    throw new Error("Print frame unavailable.");
  }

  printDoc.open();
  printDoc.write(`<!doctype html>
<html>
  <head>
    <title>${cleanTitle}</title>
    <base href="${baseHref}">
    ${styles}
    <style>
      body { margin: 0; background: #ffffff; }
      .export-print-root { box-sizing: border-box; }
      .export-print-page { display: flex; justify-content: center; align-items: flex-start; padding: 16px; box-sizing: border-box; break-after: page; page-break-after: always; }
      .export-print-page:last-child { break-after: auto; page-break-after: auto; }
      @media print { .export-print-page { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="export-print-root">${pagesHtml}</div>
  </body>
</html>`);
  printDoc.close();

  const cleanup = () => {
    if (printFrame.parentNode) {
      printFrame.parentNode.removeChild(printFrame);
    }
  };

  await waitForFonts(printDoc);
  await waitForImages(printDoc);
  printWindow.focus();
  printWindow.print();
  printWindow.onafterprint = cleanup;
  setTimeout(cleanup, 1000);
  return cleanTitle;
};
