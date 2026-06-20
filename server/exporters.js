import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import PDFDocument from "pdfkit";

const SUPPORTED_EXPORT_FORMATS = ["txt", "markdown", "docx", "pdf", "epub"];
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/simhei.ttf",
  "C:/Windows/Fonts/simsunb.ttf",
  "C:/Windows/Fonts/simfang.ttf",
  "C:/Windows/Fonts/Deng.ttf"
];

function sanitizeFileName(name) {
  return String(name || "novel")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyId(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value).replace(/\n/g, "<br/>");
}

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getOrderedChapters(project) {
  return [...(project.chapters || [])].sort((a, b) => a.number - b.number);
}

function buildProjectMarkdown(project) {
  const chapters = getOrderedChapters(project)
    .map((chapter) =>
      [
        `## 第 ${chapter.number} 章 ${chapter.title}`,
        "",
        `语气：${chapter.tone}`,
        "",
        chapter.content
      ].join("\n")
    )
    .join("\n\n---\n\n");

  return [
    `# ${project.title}`,
    "",
    `类型：${project.genre}`,
    `状态：${project.status}`,
    `创作台语气：${project.defaultTone}`,
    `目标读者：${project.targetAudience || "未设置"}`,
    "",
    "## 核心卖点",
    "",
    project.premise || "未填写",
    "",
    "## 正文",
    "",
    chapters || "暂无章节"
  ].join("\n");
}

function buildChapterMarkdown(project, chapter) {
  return [
    `# 第 ${chapter.number} 章 ${chapter.title}`,
    "",
    `所属作品：${project.title}`,
    `章节语气：${chapter.tone}`,
    `目标字数：${chapter.wordCount}`,
    "",
    "## 剧情节拍",
    "",
    ...(chapter.beats || []).map((beat) => `- ${beat}`),
    "",
    "## 正文",
    "",
    chapter.content || "暂无正文"
  ].join("\n");
}

function buildProjectText(project) {
  const chapters = getOrderedChapters(project)
    .map((chapter) =>
      [
        `第 ${chapter.number} 章 ${chapter.title}`,
        `语气：${chapter.tone}`,
        "",
        chapter.content
      ].join("\n")
    )
    .join("\n\n========================================\n\n");

  return [
    project.title,
    "",
    `类型：${project.genre}`,
    `状态：${project.status}`,
    `创作台语气：${project.defaultTone}`,
    `目标读者：${project.targetAudience || "未设置"}`,
    "",
    "核心卖点：",
    project.premise || "未填写",
    "",
    chapters || "暂无章节"
  ].join("\n");
}

function buildChapterText(project, chapter) {
  return [
    `第 ${chapter.number} 章 ${chapter.title}`,
    "",
    `所属作品：${project.title}`,
    `章节语气：${chapter.tone}`,
    `目标字数：${chapter.wordCount}`,
    "",
    "剧情节拍：",
    ...(chapter.beats || []).map((beat, index) => `${index + 1}. ${beat}`),
    "",
    chapter.content || "暂无正文"
  ].join("\n");
}

function makeParagraph(text, options = {}) {
  return new Paragraph({
    heading: options.heading,
    spacing: options.spacing || { after: 180 },
    children: [new TextRun(String(text || ""))]
  });
}

async function buildDocxBuffer(title, sections) {
  const document = new Document({
    sections: [
      {
        properties: {},
        children: [
          makeParagraph(title, { heading: HeadingLevel.TITLE, spacing: { after: 280 } }),
          ...sections
        ]
      }
    ]
  });

  return Packer.toBuffer(document);
}

async function buildProjectDocx(project) {
  const children = [
    makeParagraph(`类型：${project.genre}`),
    makeParagraph(`状态：${project.status}`),
    makeParagraph(`创作台语气：${project.defaultTone}`),
    makeParagraph(`目标读者：${project.targetAudience || "未设置"}`),
    makeParagraph("核心卖点", { heading: HeadingLevel.HEADING_1 }),
    ...splitParagraphs(project.premise || "未填写").map((text) => makeParagraph(text))
  ];

  for (const chapter of getOrderedChapters(project)) {
    children.push(makeParagraph(`第 ${chapter.number} 章 ${chapter.title}`, { heading: HeadingLevel.HEADING_1 }));
    children.push(makeParagraph(`语气：${chapter.tone}`));
    for (const paragraph of splitParagraphs(chapter.content)) {
      children.push(makeParagraph(paragraph));
    }
  }

  if (!project.chapters?.length) {
    children.push(makeParagraph("暂无章节"));
  }

  return buildDocxBuffer(project.title, children);
}

async function buildChapterDocx(project, chapter) {
  const children = [
    makeParagraph(`所属作品：${project.title}`),
    makeParagraph(`章节语气：${chapter.tone}`),
    makeParagraph(`目标字数：${chapter.wordCount}`),
    makeParagraph("剧情节拍", { heading: HeadingLevel.HEADING_1 }),
    ...(chapter.beats?.length
      ? chapter.beats.map((beat, index) => makeParagraph(`${index + 1}. ${beat}`))
      : [makeParagraph("暂无剧情节拍")]),
    makeParagraph("正文", { heading: HeadingLevel.HEADING_1 }),
    ...splitParagraphs(chapter.content || "暂无正文").map((text) => makeParagraph(text))
  ];

  return buildDocxBuffer(`第 ${chapter.number} 章 ${chapter.title}`, children);
}

function getAvailablePdfFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function createPdfBuffer(render) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 48, left: 56, right: 56 }
    });
    const pass = new PassThrough();
    const chunks = [];

    pass.on("data", (chunk) => chunks.push(chunk));
    pass.on("end", () => resolve(Buffer.concat(chunks)));
    pass.on("error", reject);
    doc.on("error", reject);
    doc.pipe(pass);

    const fontPath = getAvailablePdfFont();
    if (fontPath) {
      doc.font(fontPath);
    }

    render(doc);
    doc.end();
  });
}

function addPdfParagraphs(doc, text) {
  const paragraphs = splitParagraphs(text || "暂无正文");
  for (const paragraph of paragraphs) {
    doc.fontSize(12).text(paragraph, { lineGap: 6 });
    doc.moveDown(0.8);
  }
}

async function buildProjectPdf(project) {
  return createPdfBuffer((doc) => {
    doc.fontSize(20).text(project.title, { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(`类型：${project.genre}`);
    doc.text(`状态：${project.status}`);
    doc.text(`创作台语气：${project.defaultTone}`);
    doc.text(`目标读者：${project.targetAudience || "未设置"}`);
    doc.moveDown();
    doc.fontSize(14).text("核心卖点");
    doc.moveDown(0.4);
    addPdfParagraphs(doc, project.premise || "未填写");

    const chapters = getOrderedChapters(project);
    if (!chapters.length) {
      doc.fontSize(12).text("暂无章节");
      return;
    }

    for (const chapter of chapters) {
      doc.addPage();
      doc.fontSize(18).text(`第 ${chapter.number} 章 ${chapter.title}`);
      doc.moveDown(0.5);
      doc.fontSize(11).text(`语气：${chapter.tone}`);
      doc.moveDown();
      addPdfParagraphs(doc, chapter.content);
    }
  });
}

async function buildChapterPdf(project, chapter) {
  return createPdfBuffer((doc) => {
    doc.fontSize(20).text(`第 ${chapter.number} 章 ${chapter.title}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(`所属作品：${project.title}`);
    doc.text(`章节语气：${chapter.tone}`);
    doc.text(`目标字数：${chapter.wordCount}`);
    doc.moveDown();
    doc.fontSize(14).text("剧情节拍");
    doc.moveDown(0.4);
    if (chapter.beats?.length) {
      chapter.beats.forEach((beat, index) => doc.fontSize(11).text(`${index + 1}. ${beat}`, { lineGap: 4 }));
    } else {
      doc.fontSize(11).text("暂无剧情节拍");
    }
    doc.moveDown();
    doc.fontSize(14).text("正文");
    doc.moveDown(0.4);
    addPdfParagraphs(doc, chapter.content);
  });
}

function buildEpubNavigation(title, entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>目录</h1>
      <ol>
        ${entries
          .map((entry) => `<li><a href="${escapeXml(entry.href)}">${escapeXml(entry.label)}</a></li>`)
          .join("")}
      </ol>
    </nav>
  </body>
</html>`;
}

function buildTocNcx(title, entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(slugifyId(title))}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    ${entries
      .map(
        (entry, index) => `<navPoint id="nav-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(entry.label)}</text></navLabel>
      <content src="${escapeXml(entry.href)}" />
    </navPoint>`
      )
      .join("")}
  </navMap>
</ncx>`;
}

function buildPackageOpf(metadata, entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(metadata.id)}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>${escapeXml(metadata.creator)}</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    ${entries
      .map(
        (entry, index) =>
          `<item id="item-${index + 1}" href="${escapeXml(entry.href)}" media-type="application/xhtml+xml" />`
      )
      .join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${entries.map((_, index) => `<itemref idref="item-${index + 1}" />`).join("\n    ")}
  </spine>
</package>`;
}

async function buildEpubBuffer(metadata, entries) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const oebps = zip.folder("OEBPS");
  oebps.file("nav.xhtml", buildEpubNavigation(metadata.title, entries));
  oebps.file("toc.ncx", buildTocNcx(metadata.title, entries));
  oebps.file("content.opf", buildPackageOpf(metadata, entries));
  entries.forEach((entry) => {
    oebps.file(entry.href, entry.content);
  });

  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
}

async function buildProjectEpub(project) {
  const chapters = getOrderedChapters(project);
  const entries = (chapters.length ? chapters : [{ number: 0, title: "正文", content: "暂无章节", tone: project.defaultTone }]).map(
    (chapter) => ({
      href: `chapter-${chapter.number || 1}.xhtml`,
      label: chapter.number ? `第 ${chapter.number} 章 ${chapter.title}` : chapter.title,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(chapter.number ? `第 ${chapter.number} 章 ${chapter.title}` : chapter.title)}</title>
  </head>
  <body>
    <h1>${escapeXml(chapter.number ? `第 ${chapter.number} 章 ${chapter.title}` : chapter.title)}</h1>
    <p><strong>语气：</strong>${escapeXml(chapter.tone || project.defaultTone)}</p>
    ${splitParagraphs(chapter.content || "暂无正文")
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("\n    ")}
  </body>
</html>`
    })
  );

  return buildEpubBuffer(
    {
      id: slugifyId(project.id),
      title: project.title,
      creator: "AI Novel Studio"
    },
    entries
  );
}

async function buildChapterEpub(project, chapter) {
  return buildEpubBuffer(
    {
      id: slugifyId(chapter.id),
      title: `第 ${chapter.number} 章 ${chapter.title}`,
      creator: project.title
    },
    [
      {
        href: "chapter.xhtml",
        label: `第 ${chapter.number} 章 ${chapter.title}`,
        content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(`第 ${chapter.number} 章 ${chapter.title}`)}</title>
  </head>
  <body>
    <h1>${escapeXml(`第 ${chapter.number} 章 ${chapter.title}`)}</h1>
    <p><strong>所属作品：</strong>${escapeXml(project.title)}</p>
    <p><strong>章节语气：</strong>${escapeXml(chapter.tone)}</p>
    ${(chapter.beats || []).length
      ? `<h2>剧情节拍</h2><ol>${chapter.beats
          .map((beat) => `<li>${escapeHtml(beat)}</li>`)
          .join("")}</ol>`
      : ""}
    <h2>正文</h2>
    ${splitParagraphs(chapter.content || "暂无正文")
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("\n    ")}
  </body>
</html>`
      }
    ]
  );
}

function normalizeExportFormat(format) {
  const raw = String(format || "markdown").trim().toLowerCase();
  const alias = {
    md: "markdown",
    markdown: "markdown",
    txt: "txt",
    text: "txt",
    docx: "docx",
    word: "docx",
    pdf: "pdf",
    epub: "epub",
    equb: "epub"
  };

  const normalized = alias[raw];
  if (!normalized || !SUPPORTED_EXPORT_FORMATS.includes(normalized)) {
    const error = new Error(`不支持的导出格式：${format}`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function resolveMime(format) {
  return {
    txt: "text/plain; charset=utf-8",
    markdown: "text/markdown; charset=utf-8",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
    epub: "application/epub+zip"
  }[format];
}

function resolveExtension(format) {
  return {
    txt: "txt",
    markdown: "md",
    docx: "docx",
    pdf: "pdf",
    epub: "epub"
  }[format];
}

async function exportProjectFile(project, requestedFormat) {
  const format = normalizeExportFormat(requestedFormat);
  const title = sanitizeFileName(project.title || "novel");
  let body;

  if (format === "txt") body = Buffer.from(buildProjectText(project), "utf8");
  if (format === "markdown") body = Buffer.from(buildProjectMarkdown(project), "utf8");
  if (format === "docx") body = await buildProjectDocx(project);
  if (format === "pdf") body = await buildProjectPdf(project);
  if (format === "epub") body = await buildProjectEpub(project);

  return {
    body,
    format,
    contentType: resolveMime(format),
    fileName: `${title}.${resolveExtension(format)}`
  };
}

async function exportChapterFile(project, chapter, requestedFormat) {
  const format = normalizeExportFormat(requestedFormat);
  const title = sanitizeFileName(`第${chapter.number}章-${chapter.title || "chapter"}`);
  let body;

  if (format === "txt") body = Buffer.from(buildChapterText(project, chapter), "utf8");
  if (format === "markdown") body = Buffer.from(buildChapterMarkdown(project, chapter), "utf8");
  if (format === "docx") body = await buildChapterDocx(project, chapter);
  if (format === "pdf") body = await buildChapterPdf(project, chapter);
  if (format === "epub") body = await buildChapterEpub(project, chapter);

  return {
    body,
    format,
    contentType: resolveMime(format),
    fileName: `${title}.${resolveExtension(format)}`
  };
}

function setDownloadHeaders(response, file) {
  response.setHeader("Content-Type", file.contentType);
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="download.${resolveExtension(file.format)}"; filename*=UTF-8''${encodeURIComponent(
      file.fileName
    )}`
  );
}

export {
  exportChapterFile,
  exportProjectFile,
  normalizeExportFormat,
  setDownloadHeaders
};
