import { access, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const HTML_DATA_DIRECTORY = path.resolve(serviceDirectory, '../../HTML_DATA');

const sanitizeFilePart = (value, fallback) => {
  const sanitized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[. _-]+$/g, '')
    .slice(0, 100);

  return sanitized || fallback;
};

export const buildLoaHtmlFileName = (loaNo, tenderNo) => {
  const safeLoaNo = sanitizeFilePart(loaNo, 'unknown-loa');
  const safeTenderNo = sanitizeFilePart(tenderNo, 'no-tender');
  return `${safeLoaNo}_${safeTenderNo}.html`;
};

export const saveLoaHtmlFile = async ({ buffer, loaNo, tenderNo }) => {
  const fileName = buildLoaHtmlFileName(loaNo, tenderNo);
  const filePath = path.join(HTML_DATA_DIRECTORY, fileName);

  await mkdir(HTML_DATA_DIRECTORY, { recursive: true });
  await writeFile(filePath, buffer);

  return fileName;
};

export const getLoaHtmlFilePath = async (fileName) => {
  if (!fileName || path.basename(fileName) !== fileName || path.extname(fileName).toLowerCase() !== '.html') {
    return null;
  }

  const filePath = path.join(HTML_DATA_DIRECTORY, fileName);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(`${HTML_DATA_DIRECTORY}${path.sep}`)) {
    return null;
  }

  try {
    await access(resolvedPath);
    return resolvedPath;
  } catch {
    return null;
  }
};
