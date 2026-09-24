import * as cheerio from 'cheerio';
import he from 'he';
import { tableRows, visibleBreakupGroups } from './loaTables.js';

const VALUE_SELECTORS = {
  letterNo: ['#letterNoVal', 'span#letterNoVal'],
  letterDate: ['#letterDateVal', '#letterDate', '#letterDateValSpan'],
  bidId: ['input#bidId', '#bidId'],
  tdId: ['input#tdId', '#tdId'],
  tdVersion: ['input#tdVersion', '#tdVersion']
};

const IMPORTANT_CONDITION_KEYWORDS = [
  'condition',
  'shall',
  'performance guarantee',
  'security deposit',
  'completion',
  'agreement',
  'payment',
  'penalty',
  'tax',
  'contract',
  'terms'
];

const ITEM_FIELDS = [
  'item_sno',
  'item_desc',
  'item_code',
  'item_qty',
  'qty_unit',
  'unit_rate',
  'escalation_percent',
  'advt_value',
  'bid_rate_or_unit_rate',
  'bid_amount'
];

const ITEM_FIELD_PATTERNS = {
  item_sno: [
    /^itemsno$/,
    /^itemsrno$/,
    /^itemserialno$/,
    /^itemno$/,
    /^sno$/,
    /^serialno$/,
    /^scheduleitemno$/,
    /^scheduleitemsno$/,
    /^schedulesno$/,
    /^schitemsno$/,
    /^schsno$/
  ],
  item_desc: [
    /^itemdesc$/,
    /^itemdescription$/,
    /^description$/,
    /^desc$/,
    /^itemname$/,
    /^workdescription$/,
    /^scheduledesc$/,
    /^scheduledescription$/,
    /^schedulename$/,
    /^schdesc$/
  ],
  item_code: [/^itemcode$/, /^code$/, /^itemid$/, /^itemnoid$/, /^schid$/, /^scheduleid$/, /^plno$/, /^saccode$/, /^hsncode$/],
  item_qty: [/^itemqty$/, /^itemquantity$/, /^quantity$/, /^qty$/, /^advtqty$/, /^advertisedqty$/],
  qty_unit: [
    /^measurementunitdesc$/,
    /^measurementunitdescription$/,
    /^measurementunit$/,
    /^qtyunit$/,
    /^quantityunit$/,
    /^unitofqty$/,
    /^unitofquantity$/,
    /^uom$/,
    /^unit$/,
    /^unitname$/
  ],
  unit_rate: [
    /^itemrate$/,
    /^itemraters$/,
    /^unitrate$/,
    /^unitraters$/,
    /^basicrate$/,
    /^basicraters$/,
    /^rate$/,
    /^advtunitrate$/,
    /^advertisedunitrate$/
  ],
  escalation_percent: [
    /^esclrate$/,
    /^esclpercent$/,
    /^esclpercentage$/,
    /^escrate$/,
    /^escalation$/,
    /^escalationpercent$/,
    /^escalationpercentage$/,
    /^escalationper$/,
    /^esc$/,
    /^escpercent$/,
    /^escpercentage$/,
    /^escper$/
  ],
  advt_value: [
    /^advvalue$/,
    /^advtvalue$/,
    /^advertisedvalue$/,
    /^advertizedvalue$/,
    /^advtamount$/,
    /^advertisedamount$/,
    /^estimatedvalue$/,
    /^estimatedamount$/
  ],
  bid_rate_or_unit_rate: [
    /^bidrateorunitrate$/,
    /^bidrateunitrate$/,
    /^bidunitrate$/,
    /^bidrate$/,
    /^quotedrate$/,
    /^ratequoted$/,
    /^offeredrate$/,
    /^bidofferedrate$/
  ],
  bid_amount: [/^bidamount$/, /^bidvalue$/, /^quotedamount$/, /^quotedvalue$/, /^offeredamount$/, /^bidofferedamount$/]
};

const ITEM_SECTION_KEY_PATTERNS = {
  master: [/^schloadata$/, /^scheduleloadata$/, /^scheduledata$/, /^schdata$/, /^scheduleitems?$/],
  child: [/^itemdata$/, /^loaditemdata$/, /^itembreakup$/, /^itembreakupdata$/, /^breakupdata$/, /^items?$/]
};

const ITEM_LINK_PATTERNS = {
  scheduleKey: [
    /^schid$/,
    /^scheduleid$/,
    /^schno$/,
    /^scheduleno$/,
    /^schsno$/,
    /^schedulesno$/,
    /^schitemsno$/,
    /^scheduleitemsno$/,
    /^parentitemsno$/,
    /^parentitemno$/,
    /^masteritemsno$/,
    /^masteritemno$/
  ]
};

const INLINE_ITEM_LABEL_PATTERNS = {
  item_sno: /item\s*s(?:no|\.?\s*no)?\.?/gi,
  item_desc: /item\s*desc(?:ription)?\.?/gi,
  item_code: /item\s*code\.?/gi,
  item_qty: /item\s*qty|quantity|qty\.?/gi,
  qty_unit: /qty\s*unit|unit\s*of\s*qty|uom|unit\.?/gi,
  unit_rate: /unit\s*rate|basic\s*rate/gi,
  escalation_percent: /escalation\s*(?:percent|percentage|%)|esc\.?\s*(?:percent|percentage|%)/gi,
  advt_value: /adv\.?\s*value|advt\.?\s*value|advertised\s*value|estimated\s*value/gi,
  bid_rate_or_unit_rate: /bid\s*rate\s*(?:or|\/)?\s*unit\s*rate|bid\s*unit\s*rate|quoted\s*rate|bid\s*rate/gi,
  bid_amount: /bid\s*amount|quoted\s*amount|offered\s*amount/gi
};

export const normalizeText = (value = '') => {
  return he
    .decode(String(value))
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
};

const compactText = (value = '') => normalizeText(value).replace(/\s+/g, ' ').trim();

const normalizeDate = (value = '') => {
  const match = compactText(value).match(/\b([0-3]?\d)[./-]([01]?\d)[./-](\d{2,4})\b/);
  if (!match) {
    return '';
  }

  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}-${year}`;
};

const addMonthsToDate = (dateValue, months) => {
  const normalizedDate = normalizeDate(dateValue);
  const monthCount = Number.parseInt(months, 10);
  if (!normalizedDate || !Number.isFinite(monthCount)) {
    return '';
  }

  const [day, month, year] = normalizedDate.split('-').map(Number);
  const targetMonthStart = new Date(Date.UTC(year, month - 1 + monthCount, 1));
  const lastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const result = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth(), Math.min(day, lastDay))
  );

  return [
    String(result.getUTCDate()).padStart(2, '0'),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    result.getUTCFullYear()
  ].join('-');
};

const canonicalKey = (value = '') => compactText(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const isScalarValue = (value) => {
  return value !== null && value !== undefined && typeof value !== 'object';
};

const getElementValue = ($, selectors) => {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (!element.length) {
      continue;
    }

    const value = element.attr('value') || element.text();
    const normalized = compactText(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const getBodyLines = ($) => {
  return $('body')
    .text()
    .split(/\r?\n/)
    .map((line) => compactText(line))
    .filter(Boolean);
};

const getLetterHeader = ($) => {
  const letterNumberElement = $('#letterNoVal').first();
  const letterRow = letterNumberElement.closest('tr');
  const letterCell = letterNumberElement.closest('td');
  const letterNoFull = removeLabel(compactText(letterCell.text()), 'Letter No');
  const datedCell = letterRow
    .find('td')
    .toArray()
    .map((cell) => compactText($(cell).text()))
    .find((text) => /^Dated\s*:/i.test(text));

  return {
    letter_no_full: letterNoFull,
    loa_date: normalizeDate(datedCell || '')
  };
};

const getTenderReference = ($) => {
  let referenceText = '';
  $('td').each((_, cell) => {
    const text = compactText($(cell).text());
    if (!referenceText && /^Tender\s+No\.?\s+/i.test(text) && /closing\s+date/i.test(text)) {
      referenceText = text;
    }
  });

  const tenderNo = referenceText.match(/^Tender\s+No\.?\s+(.+?)\s+closing\s+date\b/i)?.[1] || '';
  const tenderValidUptoDate = referenceText.match(
    /closing\s+date\s+([0-3]?\d[./-][01]?\d[./-]\d{2,4})/i
  )?.[1];
  const workDescription = referenceText.match(/\s+for\s+(.+)$/i)?.[1] || '';

  let bidReferenceDate = '';
  $('td').each((_, cell) => {
    const text = compactText($(cell).text());
    if (bidReferenceDate || !/Your\s+bid\s+ID/i.test(text)) {
      return;
    }

    bidReferenceDate = normalizeDate(text.match(/\bdated\s+([0-3]?\d[./-][01]?\d[./-]\d{2,4})/i)?.[1] || '');
  });

  return {
    tender_no: compactText(tenderNo),
    tender_valid_upto_date: normalizeDate(tenderValidUptoDate || ''),
    work_description: compactText(workDescription),
    letter_date: bidReferenceDate
  };
};

const getContractorDetails = ($) => {
  let contractorRow = null;

  $('tr').each((_, row) => {
    if (contractorRow) {
      return;
    }

    const text = compactText($(row).children('td').first().text());
    if (/^M\/s\b/i.test(text)) {
      contractorRow = $(row);
    }
  });

  if (!contractorRow) {
    return { name: '', address: '' };
  }

  const name = compactText(contractorRow.children('td').first().text()).replace(/^M\/s\s*/i, '');
  const addressLines = [];
  let nextRow = contractorRow.next();

  while (nextRow.length) {
    const text = compactText(nextRow.children('td').first().text());
    if (!text || /^(Sub|Ref)\s*:/i.test(text)) {
      break;
    }

    addressLines.push(text);
    nextRow = nextRow.next();
  }

  return {
    name,
    address: addressLines.join(', ')
  };
};

const getRailwayHeaderDetails = ($) => {
  const letterRow = $('#letterNoVal').first().closest('tr');
  const headerLines = letterRow
    .prevAll('tr')
    .toArray()
    .reverse()
    .flatMap((row) =>
      $(row)
        .children('td')
        .toArray()
        .map((cell) => compactText($(cell).text()))
    )
    .filter(Boolean);
  const railway = headerLines.find((line) => /\bRLY\b/i.test(line) && !/^Office\b/i.test(line)) || '';
  const divisionDepartment = headerLines.find((line) => /\bDIVISION\b/i.test(line)) || '';
  const divisionMatch = divisionDepartment.match(/^(.*?)\s*-?\s*DIVISION\s*-?\s*(.*)$/i);
  const officeIndex = headerLines.findIndex((line) => /^Office\b/i.test(line));
  const office =
    officeIndex === -1
      ? ''
      : headerLines
          .slice(officeIndex)
          .map((line) => line.replace(/,\s*$/, ''))
          .join(', ');

  return {
    railway,
    division: compactText(divisionMatch?.[1] || divisionDepartment),
    department: compactText(divisionMatch?.[2] || ''),
    office
  };
};

const removeLabel = (text, label) => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return compactText(text.replace(new RegExp(`^\\s*${escapedLabel}\\s*[:.\\-]?\\s*`, 'i'), ''));
};

const isLabelText = (text, label) => {
  const lowerText = compactText(text).toLowerCase();
  const lowerLabel = label.toLowerCase();

  if (lowerText === lowerLabel) {
    return true;
  }

  return new RegExp(`^${lowerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*[:.\\-]|\\s{2,}|$)`).test(
    lowerText
  );
};

const findValueByLabels = ($, labels) => {
  const lowerLabels = labels.map((label) => label.toLowerCase());
  let found = '';

  $('tr').each((_, row) => {
    if (found) {
      return false;
    }

    const cells = $(row)
      .find('th,td')
      .toArray()
      .map((cell) => compactText($(cell).text()))
      .filter(Boolean);

    for (let index = 0; index < cells.length; index += 1) {
      const labelIndex = lowerLabels.findIndex((label) => isLabelText(cells[index], label));

      if (labelIndex === -1) {
        continue;
      }

      const sameCellValue = removeLabel(cells[index], labels[labelIndex]);
      if (sameCellValue && sameCellValue.toLowerCase() !== labels[labelIndex].toLowerCase()) {
        found = sameCellValue;
        return false;
      }

      if (cells[index + 1]) {
        found = cells[index + 1];
        return false;
      }
    }

    return undefined;
  });

  if (found) {
    return found;
  }

  const lines = getBodyLines($);
  for (const line of lines) {
    const labelIndex = lowerLabels.findIndex((label) => isLabelText(line, label));
    if (labelIndex !== -1) {
      const value = removeLabel(line, labels[labelIndex]);
      if (value && value.toLowerCase() !== labels[labelIndex].toLowerCase()) {
        return value;
      }
    }
  }

  return '';
};

const findRegexValue = (text, regexes) => {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) {
      return compactText(match[1]);
    }
  }

  return '';
};

const parseAmount = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = compactText(value);
  const match = text.match(/(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.\d+)?)/i);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const toNumberOrNull = (value) => {
  const parsed = parseAmount(value);
  return parsed === null ? null : parsed;
};

const emptyToNull = (value) => {
  const normalized = compactText(value);
  return normalized ? normalized : null;
};

const parseJsonCandidate = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  const candidates = new Set();
  const raw = String(rawValue).trim();
  candidates.add(raw);
  candidates.add(he.decode(raw));

  try {
    candidates.add(decodeURIComponent(raw));
  } catch {
    // Ignore non URI-encoded hidden values.
  }

  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized) {
      continue;
    }

    try {
      const parsed = JSON.parse(normalized);
      if (typeof parsed === 'string') {
        return JSON.parse(parsed);
      }
      return parsed;
    } catch {
      // Try the next decoded candidate.
    }
  }

  return null;
};

const extractHiddenJsonData = ($) => {
  const hiddenJson = {};

  $('input[type="hidden"], input[id^="loaData"], textarea, script[type="application/json"]').each((index, input) => {
    const element = $(input);
    const id = element.attr('id') || element.attr('name') || `embedded_json_${index}`;
    const rawValue = element.attr('value') || element.text() || '';
    const parsed = parseJsonCandidate(rawValue);

    if (id && parsed !== null && typeof parsed === 'object') {
      hiddenJson[id] = parsed;
    }
  });

  return hiddenJson;
};

const walkValues = (value, visitor, path = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValues(item, visitor, [...path, String(index)]));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      visitor(key, item, [...path, key]);
      walkValues(item, visitor, [...path, key]);
    });
  }
};

const findDeepValue = (objects, keyRegexes) => {
  for (const object of objects) {
    let found = '';

    walkValues(object, (key, value) => {
      if (found || value === null || typeof value === 'object') {
        return;
      }

      if (keyRegexes.some((regex) => regex.test(key))) {
        found = compactText(value);
      }
    });

    if (found) {
      return found;
    }
  }

  return '';
};

const extractLoaNumberFromLetterNo = (letterNoFull) => {
  const text = compactText(letterNoFull);
  if (!text) {
    return '';
  }

  const segments = text
    .split('/')
    .map((segment) => compactText(segment))
    .filter(Boolean);

  if (segments.length > 1) {
    const lastSegment = segments[segments.length - 1];
    const numeric = lastSegment.match(/\b\d{5,}\b/);
    if (numeric) {
      return numeric[0];
    }

    const alphanumeric = lastSegment.match(/\b[A-Z0-9][A-Z0-9-]{5,}\b/i);
    if (alphanumeric) {
      return alphanumeric[0];
    }
  }

  const slashNumber = text.match(/\/\s*(\d{5,})\s*$/);
  if (slashNumber) {
    return slashNumber[1];
  }

  const trailingNumber = text.match(/\b(\d{8,})\b\s*$/);
  return trailingNumber?.[1] || '';
};

const extractImportantConditions = ($) => {
  const seen = new Set();
  const conditions = [];

  $('p,li,tr').each((_, element) => {
    const text = compactText($(element).text());
    const lowerText = text.toLowerCase();

    if (
      text.length < 40 ||
      seen.has(lowerText) ||
      !IMPORTANT_CONDITION_KEYWORDS.some((keyword) => lowerText.includes(keyword))
    ) {
      return;
    }

    seen.add(lowerText);
    conditions.push(text);
  });

  return conditions.slice(0, 60);
};

const getRailwayDetails = ($, hiddenValues) => {
  const headerDetails = getRailwayHeaderDetails($);

  return {
    railway: headerDetails.railway ||
      findValueByLabels($, ['railway', 'zonal railway']) ||
      findDeepValue(hiddenValues, [/railway/i, /zone/i]),
    division: headerDetails.division ||
      findValueByLabels($, ['division', 'divn']) ||
      findDeepValue(hiddenValues, [/division/i, /divn/i]),
    department: headerDetails.department ||
      findValueByLabels($, ['department', 'dept']) ||
      findDeepValue(hiddenValues, [/department/i, /dept/i]),
    office: headerDetails.office ||
      findValueByLabels($, ['office', 'office name']) ||
      findDeepValue(hiddenValues, [/office/i])
  };
};

const getScalarEntries = (value, { deep = false } = {}) => {
  const entries = [];

  if (!deep && value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, item]) => {
      if (!isScalarValue(item)) {
        return;
      }

      entries.push({
        key,
        keyCanonical: canonicalKey(key),
        pathCanonical: canonicalKey(key),
        value: compactText(item)
      });
    });

    return entries.filter((entry) => entry.value !== '');
  }

  walkValues(value, (key, item, path) => {
    if (!isScalarValue(item)) {
      return;
    }

    entries.push({
      key,
      keyCanonical: canonicalKey(key),
      pathCanonical: path.map((part) => canonicalKey(part)).filter(Boolean).join('.'),
      value: compactText(item)
    });
  });

  return entries.filter((entry) => entry.value !== '');
};

const findEntryValue = (entries, patterns) => {
  for (const pattern of patterns) {
    const direct = entries.find((entry) => pattern.test(entry.keyCanonical));
    if (direct) {
      return direct.value;
    }
  }

  for (const pattern of patterns) {
    const pathMatch = entries.find((entry) => entry.pathCanonical.split('.').some((part) => pattern.test(part)));
    if (pathMatch) {
      return pathMatch.value;
    }
  }

  return '';
};

const normalizeItemRecord = (rawItem = {}) => {
  const entries = getScalarEntries(rawItem);

  return ITEM_FIELDS.reduce((item, field) => {
    item[field] = findEntryValue(entries, ITEM_FIELD_PATTERNS[field]) || '';
    return item;
  }, {});
};

const hasItemData = (item) => {
  return ITEM_FIELDS.some((field) => compactText(item[field]));
};

const normalizeSnoForCompare = (value = '') => {
  return compactText(value)
    .split('.')
    .map((part) => part.replace(/^0+(?=\d)/, '') || '0')
    .join('.');
};

const getParentSno = (itemSno = '') => {
  const normalized = normalizeSnoForCompare(itemSno);
  if (!normalized.includes('.')) {
    return '';
  }

  return normalized.split('.')[0];
};

const isChildSno = (itemSno = '') => normalizeSnoForCompare(itemSno).includes('.');

const collectValuesByKeyPatterns = (objects, keyPatterns) => {
  const values = [];

  objects.forEach((object) => {
    walkValues(object, (key, value) => {
      const normalizedKey = canonicalKey(key);
      if (keyPatterns.some((pattern) => pattern.test(normalizedKey))) {
        values.push(value);
      }
    });
  });

  return values;
};

const materializeRecords = (value) => {
  const parsed = typeof value === 'string' ? parseJsonCandidate(value) || value : value;

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => materializeRecords(item));
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  for (const nestedKey of ['data', 'rows', 'items', 'records', 'list']) {
    if (Array.isArray(parsed[nestedKey])) {
      return materializeRecords(parsed[nestedKey]);
    }
  }

  const values = Object.values(parsed);
  if (values.length === 1 && Array.isArray(values[0])) {
    return materializeRecords(values[0]);
  }

  if (values.length && values.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
    const directItem = normalizeItemRecord(parsed);
    if (hasItemData(directItem)) {
      return [parsed];
    }

    return values.flatMap((item) => materializeRecords(item));
  }

  return [parsed];
};

const toNormalizedItemRecords = (records) => {
  return records
    .map((raw) => ({
      raw,
      item: normalizeItemRecord(raw)
    }))
    .filter(({ item }) => hasItemData(item));
};

const getItemLinkValues = (rawItem, normalizedItem) => {
  const entries = getScalarEntries(rawItem);
  const links = [
    findEntryValue(entries, ITEM_LINK_PATTERNS.scheduleKey),
    normalizedItem.item_sno,
    getParentSno(normalizedItem.item_sno)
  ];

  return links.map((link) => normalizeSnoForCompare(link)).filter(Boolean);
};

const createItemNode = (item) => ({
  ...ITEM_FIELDS.reduce((node, field) => {
    node[field] = item[field] || '';
    return node;
  }, {}),
  child_items: []
});

const groupFlatItemRecords = (records) => {
  const normalizedRecords = records
    .map((record) => ('item' in record ? record : { raw: record.raw || record, item: record.item || record }))
    .filter(({ item }) => hasItemData(item));

  const masters = normalizedRecords.filter(({ item }) => item.item_sno && !isChildSno(item.item_sno));
  const children = normalizedRecords.filter(({ item }) => !item.item_sno || isChildSno(item.item_sno));

  if (!masters.length) {
    return normalizedRecords.map(({ item }) => createItemNode(item));
  }

  const masterNodes = masters.map(({ item }) => createItemNode(item));
  const masterIndex = new Map();

  masterNodes.forEach((master, index) => {
    const key = normalizeSnoForCompare(master.item_sno);
    if (key) {
      masterIndex.set(key, index);
    }
  });

  children.forEach(({ item }) => {
    const parentKey = getParentSno(item.item_sno);
    const masterIndexValue = masterIndex.get(parentKey);

    if (masterIndexValue !== undefined) {
      masterNodes[masterIndexValue].child_items.push({ ...item });
      return;
    }

    if (masterNodes.length === 1) {
      masterNodes[0].child_items.push({ ...item });
      return;
    }

    masterNodes.push(createItemNode(item));
  });

  return masterNodes;
};

const extractItemBreakupFromHiddenData = (hiddenValues) => {
  const masterValues = collectValuesByKeyPatterns(hiddenValues, ITEM_SECTION_KEY_PATTERNS.master);
  const childValues = collectValuesByKeyPatterns(hiddenValues, ITEM_SECTION_KEY_PATTERNS.child);
  const masterRecords = toNormalizedItemRecords(masterValues.flatMap((value) => materializeRecords(value)));
  const childRecords = toNormalizedItemRecords(childValues.flatMap((value) => materializeRecords(value)));

  if (!masterRecords.length && !childRecords.length) {
    return [];
  }

  if (!masterRecords.length) {
    return groupFlatItemRecords(childRecords);
  }

  const masterNodes = masterRecords.map(({ item }) => createItemNode(item));
  const masterIndex = new Map();

  masterRecords.forEach(({ raw, item }, index) => {
    getItemLinkValues(raw, item).forEach((link) => {
      if (!masterIndex.has(link)) {
        masterIndex.set(link, index);
      }
    });
  });

  const orphanChildren = [];
  childRecords.forEach(({ raw, item }) => {
    const links = getItemLinkValues(raw, item);
    const matchedIndex = links.map((link) => masterIndex.get(link)).find((index) => index !== undefined);

    if (matchedIndex !== undefined) {
      masterNodes[matchedIndex].child_items.push({ ...item });
      return;
    }

    if (masterNodes.length === 1) {
      masterNodes[0].child_items.push({ ...item });
      return;
    }

    orphanChildren.push({ raw, item });
  });

  return [...masterNodes, ...groupFlatItemRecords(orphanChildren)];
};

const fieldFromHeader = (text) => {
  const normalized = canonicalKey(text);
  return ITEM_FIELDS.find((field) => ITEM_FIELD_PATTERNS[field].some((pattern) => pattern.test(normalized)));
};

const parseLabelValueCells = (cells) => {
  const item = {};

  for (let index = 0; index < cells.length; index += 1) {
    const field = fieldFromHeader(cells[index]);
    if (!field) {
      continue;
    }

    const separatorMatch = cells[index].match(/^(.*?)\s*(?::|\s-\s)\s*(.+)$/);
    const sameCellValue =
      separatorMatch && fieldFromHeader(separatorMatch[1]) === field ? compactText(separatorMatch[2]) : '';
    const nextValue = cells[index + 1] && !fieldFromHeader(cells[index + 1]) ? cells[index + 1] : '';
    const value = sameCellValue || nextValue;

    if (value) {
      item[field] = value;
      if (nextValue) {
        index += 1;
      }
    }
  }

  return item;
};

const parseInlineItemRow = (text) => {
  const rowText = compactText(text);
  const matches = [];

  Object.entries(INLINE_ITEM_LABEL_PATTERNS).forEach(([field, labelRegex]) => {
    const regex = new RegExp(labelRegex.source, labelRegex.flags);

    for (const match of rowText.matchAll(regex)) {
      matches.push({
        field,
        index: match.index,
        end: match.index + match[0].length
      });
    }
  });

  const uniqueMatches = Array.from(
    new Map(matches.map((match) => [`${match.field}:${match.index}`, match])).values()
  ).sort((a, b) => a.index - b.index);

  return uniqueMatches.reduce((item, match, index) => {
    const next = uniqueMatches[index + 1];
    const rawValue = rowText.slice(match.end, next ? next.index : rowText.length);
    const value = compactText(rawValue.replace(/^[:.\-\s]+/, ''));
    if (value) {
      item[match.field] = value;
    }
    return item;
  }, {});
};

const extractItemBreakupFromTableRows = ($) => {
  const records = [];

  $('table').each((_, table) => {
    const tableText = compactText($(table).text());
    if (!/item\s*s(?:no|\.?\s*no)?/i.test(tableText) || !/item\s*desc/i.test(tableText)) {
      return;
    }

    let activeHeaders = [];

    $(table)
      .find('tr')
      .each((__, row) => {
        const cells = $(row)
          .find('th,td')
          .toArray()
          .map((cell) => compactText($(cell).text()));

        if (!cells.some(Boolean)) {
          return;
        }

        const headerFields = cells.map((cell) => fieldFromHeader(cell));
        const headerFieldCount = headerFields.filter(Boolean).length;
        const hasHeaderShape = headerFields.includes('item_sno') && headerFields.includes('item_desc');
        if (hasHeaderShape && headerFieldCount >= 2) {
          activeHeaders = headerFields;
          return;
        }

        const labelValueItem = parseLabelValueCells(cells);

        if (hasItemData(labelValueItem)) {
          records.push(labelValueItem);
          return;
        }

        if (activeHeaders.length) {
          const item = {};
          activeHeaders.forEach((field, index) => {
            if (field && cells[index]) {
              item[field] = cells[index];
            }
          });

          if (hasItemData(item)) {
            records.push(item);
            return;
          }
        }

        const inlineItem = parseInlineItemRow(cells.join(' '));
        if (hasItemData(inlineItem)) {
          records.push(inlineItem);
        }
      });
  });

  return groupFlatItemRecords(records);
};

const getInputValueFromRow = ($, row, prefix) => {
  const input = $(row)
    .find(`input[id^="${prefix}"], input[name^="${prefix}"]`)
    .filter((_, element) => $(element).closest('tr')[0] === row)
    .first();

  return input.length ? compactText(input.attr('value') || '') : '';
};

const getInputSuffixFromRow = ($, row, prefix) => {
  const input = $(row)
    .find(`input[id^="${prefix}"], input[name^="${prefix}"]`)
    .filter((_, element) => $(element).closest('tr')[0] === row)
    .first();
  const id = input.attr('id') || input.attr('name') || '';
  const match = id.match(new RegExp(`^${prefix}(\\d+)$`));

  return match?.[1] || '';
};

const bidTypeText = (value) => {
  const normalized = compactText(value);
  if (normalized === '1') {
    return '% Above';
  }
  if (normalized === '2') {
    return '% Below';
  }
  if (normalized === '3') {
    return '% At Par';
  }
  if (normalized === '103') {
    return 'Rs/Unit';
  }

  return normalized === 'null' ? '' : normalized;
};

const formatEscalation = (rate, type) => {
  const cleanRate = compactText(rate);
  if (!cleanRate) {
    return '';
  }

  const cleanType = compactText(type);
  if (cleanType === '2') {
    return `(-) ${cleanRate}`;
  }
  if (cleanType === '1') {
    return `(+) ${cleanRate}`;
  }

  return cleanRate;
};

const parseScheduleTitle = (text) => {
  const normalized = compactText(text);
  const directoryMatch = normalized.match(/\(Item\s*Directory\s*-\s*([^)]+)\)/i);
  const withoutDirectory = compactText(normalized.replace(/\(Item\s*Directory\s*-\s*([^)]+)\)/i, ''));
  const scheduleMatch = withoutDirectory.match(/^Schedule\s+([A-Z0-9.]+)\s*-\s*(.*)$/i);

  return {
    item_sno: scheduleMatch?.[1] || '',
    item_desc: scheduleMatch?.[2] || withoutDirectory.replace(/^Schedule\s+/i, ''),
    item_directory: directoryMatch?.[1] ? compactText(directoryMatch[1]) : '',
    description: normalized
  };
};

const createScheduleNode = (schedule) => ({
  schedule_id: schedule.schedule_id || '',
  item_sno: schedule.item_sno || '',
  item_desc: schedule.item_desc || '',
  description: schedule.description || '',
  item_directory: schedule.item_directory || '',
  schedule_item_directory: schedule.schedule_item_directory || schedule.item_directory || '',
  record_type: schedule.record_type || '',
  bid_unit: schedule.bid_unit || '',
  advt_value: schedule.advt_value || '',
  bid_rate_or_unit_rate: schedule.bid_rate_or_unit_rate || '',
  bid_type: schedule.bid_type || '',
  bid_type_text: schedule.bid_type_text || '',
  bid_amount: schedule.bid_amount || '',
  schedule_total: schedule.schedule_total || '',
  awarded_items: schedule.awarded_items || [],
  item_breaks: schedule.item_breaks || []
});

const normalizeAwardedItem = ($, row, scheduleId) => {
  const cells = $(row)
    .children('td,th')
    .toArray()
    .map((cell) => compactText($(cell).text()));
  const itemId = getInputSuffixFromRow($, row, 'itemSNo');
  const viewDetailsHref = $(row).find('a[href^="#tr"]').first().attr('href') || '';
  const viewDetailsTargetId = viewDetailsHref.replace(/^#tr/, '');
  const updationRate = getInputValueFromRow($, row, 'updationRate');
  const updationType = getInputValueFromRow($, row, 'updationType');
  const bidType = getInputValueFromRow($, row, 'bidType');
  const unitLabel = $(row).find('[id^="qtyUnitDesc"], [name^="qtyUnitDesc"]')
    .filter((_, element) => $(element).closest('tr')[0] === row).first();
  const unitCell = $(row).find('input[id^="qtyUnit"], input[name^="qtyUnit"]')
    .filter((_, element) => $(element).closest('tr')[0] === row).first().closest('td,th').clone();
  unitCell.find('input,script,style').remove();
  const unitDescription = compactText(unitLabel.text()) || compactText(unitCell.text());

  return {
    item_id: itemId,
    parent_schedule_id: scheduleId || getInputValueFromRow($, row, 'itemGroup'),
    record_type: getInputValueFromRow($, row, 'recType'),
    item_sno: getInputValueFromRow($, row, 'itemSNo') || cells[0] || '',
    item_desc: $(`#itemDesc${itemId}`).length ? compactText($(`#itemDesc${itemId}`).text()) : cells[1] || '',
    item_code: getInputValueFromRow($, row, 'itemCode'),
    item_qty: getInputValueFromRow($, row, 'itemQty'),
    qty_unit: unitDescription || getInputValueFromRow($, row, 'qtyUnit'),
    unit_rate: getInputValueFromRow($, row, 'rate'),
    basic_value: getInputValueFromRow($, row, 'basicValue'),
    escalation_percent: updationRate,
    escalation_text: formatEscalation(updationRate, updationType) || cells[3] || '',
    advt_value: getInputValueFromRow($, row, 'amount') || cells[4] || '',
    bid_unit: getInputValueFromRow($, row, 'bidUnit'),
    bid_rate_or_unit_rate: getInputValueFromRow($, row, 'bidRate'),
    bid_type: bidType,
    bid_type_text: bidTypeText(bidType),
    bid_amount: getInputValueFromRow($, row, 'bidAmount'),
    view_details_target_id: viewDetailsTargetId
  };
};

const extractAwardedSchedules = ($) => {
  const schedules = [];
  const scheduleById = new Map();
  let currentSchedule = null;

  $('tr').each((_, row) => {
    const cells = $(row)
      .children('td,th')
      .toArray()
      .map((cell) => compactText($(cell).text()));

    if (!cells.some(Boolean)) {
      return;
    }

    const firstCell = cells[0] || '';

    if (/^Schedule\s+\S+\s*-/i.test(firstCell) && !/^Schedule\s+Totals/i.test(firstCell)) {
      const scheduleId = getInputSuffixFromRow($, row, 'itemSNo');
      if (!scheduleId) {
        return;
      }

      const parsedTitle = parseScheduleTitle(firstCell);
      const bidType = getInputValueFromRow($, row, 'bidType');
      currentSchedule = createScheduleNode({
        schedule_id: scheduleId,
        item_sno: getInputValueFromRow($, row, 'itemSNo') || parsedTitle.item_sno,
        item_desc: $(`#itemDesc${scheduleId}`).length
          ? compactText($(`#itemDesc${scheduleId}`).text())
          : parsedTitle.item_desc,
        description: parsedTitle.description,
        item_directory: parsedTitle.item_directory,
        schedule_item_directory: parsedTitle.item_directory,
        record_type: getInputValueFromRow($, row, 'recType'),
        bid_unit: getInputValueFromRow($, row, 'bidUnit'),
        advt_value: getInputValueFromRow($, row, 'amount') || cells[1] || '',
        bid_rate_or_unit_rate: getInputValueFromRow($, row, 'bidRate') || cells[2] || '',
        bid_type: bidType,
        bid_type_text: cells[3] || bidTypeText(bidType),
        bid_amount: getInputValueFromRow($, row, 'bidAmount') || cells[4] || '',
        awarded_items: [],
        item_breaks: []
      });

      schedules.push(currentSchedule);
      scheduleById.set(scheduleId, currentSchedule);
      return;
    }

    if (/^Schedule\s+Totals/i.test(firstCell) && currentSchedule) {
      currentSchedule.schedule_total =
        getInputValueFromRow($, row, 'schBidTotal') || cells.find((cell) => /[0-9]/.test(cell)) || '';
      return;
    }

    const parentScheduleId = getInputValueFromRow($, row, 'itemGroup');
    if (parentScheduleId && scheduleById.has(parentScheduleId)) {
      const awardedItem = normalizeAwardedItem($, row, parentScheduleId);
      if (hasItemData(awardedItem) || awardedItem.item_desc || awardedItem.view_details_target_id) {
        scheduleById.get(parentScheduleId).awarded_items.push(awardedItem);
      }
    }
  });

  return { schedules, scheduleById };
};


const getHiddenSchedules = (hiddenValues) => {
  return collectValuesByKeyPatterns(hiddenValues, ITEM_SECTION_KEY_PATTERNS.master)
    .flatMap((value) => materializeRecords(value))
    .filter((record) => record && typeof record === 'object');
};

const normalizeHiddenItemBreak = (rawItem = {}) => {
  const item = normalizeItemRecord(rawItem);

  return {
    ...item,
    item_id: compactText(rawItem.itemId || rawItem.item_id || ''),
    schedule_id: compactText(rawItem.schId || rawItem.scheduleId || rawItem.schedule_id || ''),
    record_type: compactText(rawItem.recordType || rawItem.record_type || ''),
    bid_type: compactText(rawItem.bidType || rawItem.bid_type || ''),
    bid_type_text: compactText(rawItem.bidTypeVal || rawItem.bid_type_text || ''),
    basic_value: compactText(rawItem.basicValue || rawItem.basic_value || ''),
    amount: item.bid_amount || item.advt_value || compactText(rawItem.basicValue || ''),
    source: 'awarded_quantities'
  };
};

const mergeHiddenScheduleValues = (schedule, rawSchedule = {}) => {
  const normalizedSchedule = normalizeItemRecord(rawSchedule);
  const bidType = compactText(rawSchedule.bidType || rawSchedule.bid_type || schedule.bid_type);

  schedule.schedule_id = schedule.schedule_id || compactText(rawSchedule.schId || rawSchedule.schedule_id || '');
  schedule.item_sno = schedule.item_sno || normalizedSchedule.item_sno;
  schedule.item_desc = schedule.item_desc || normalizedSchedule.item_desc;
  schedule.record_type = schedule.record_type || compactText(rawSchedule.recordType || rawSchedule.record_type || '');
  schedule.bid_unit = schedule.bid_unit || compactText(rawSchedule.bidUnit || rawSchedule.bid_unit || '');
  schedule.advt_value = schedule.advt_value || normalizedSchedule.advt_value;
  schedule.bid_rate_or_unit_rate = schedule.bid_rate_or_unit_rate || normalizedSchedule.bid_rate_or_unit_rate;
  schedule.bid_type = schedule.bid_type || bidType;
  schedule.bid_type_text =
    schedule.bid_type_text || compactText(rawSchedule.bidTypeVal || rawSchedule.bid_type_text || bidTypeText(bidType));
  schedule.bid_amount = schedule.bid_amount || normalizedSchedule.bid_amount;
  schedule.schedule_total = schedule.schedule_total || compactText(rawSchedule.schBidTotal || rawSchedule.sch_bid_total || '');

  return schedule;
};

const extractScheduleBreakup = ($, hiddenValues) => {
  const { schedules, scheduleById } = extractAwardedSchedules($);
  const visibleBreakupByTargetId = visibleBreakupGroups($);
  const hiddenSchedules = getHiddenSchedules(hiddenValues);
  const findVisibleGroup = (schedule, itemId, sno) => visibleBreakupByTargetId.get(itemId)
    || [...visibleBreakupByTargetId.values()].find((group) =>
      normalizeSnoForCompare(group.item_sno) === normalizeSnoForCompare(sno)
      && normalizeSnoForCompare(parseScheduleTitle(`Schedule ${group.schedule_label}`).item_sno)
        === normalizeSnoForCompare(schedule.item_sno));

  hiddenSchedules.forEach((rawSchedule) => {
    const scheduleId = compactText(rawSchedule.schId || rawSchedule.schedule_id || '');
    if (!scheduleId) {
      return;
    }

    if (!scheduleById.has(scheduleId)) {
      const normalizedSchedule = normalizeItemRecord(rawSchedule);
      const schedule = createScheduleNode({
        schedule_id: scheduleId,
        item_sno: normalizedSchedule.item_sno,
        item_desc: normalizedSchedule.item_desc,
        description: normalizedSchedule.item_desc,
        record_type: compactText(rawSchedule.recordType || ''),
        bid_unit: compactText(rawSchedule.bidUnit || ''),
        advt_value: normalizedSchedule.advt_value,
        bid_rate_or_unit_rate: normalizedSchedule.bid_rate_or_unit_rate,
        bid_type: compactText(rawSchedule.bidType || ''),
        bid_type_text: compactText(rawSchedule.bidTypeVal || ''),
        bid_amount: normalizedSchedule.bid_amount,
        schedule_total: compactText(rawSchedule.schBidTotal || '')
      });
      schedules.push(schedule);
      scheduleById.set(scheduleId, schedule);
    }

    const schedule = mergeHiddenScheduleValues(scheduleById.get(scheduleId), rawSchedule);
    const hiddenItemData = Array.isArray(rawSchedule.itemData) ? rawSchedule.itemData : [];

    hiddenItemData.forEach((rawItem) => {
      const itemId = compactText(rawItem.itemId || '');
      const visibleGroup = findVisibleGroup(schedule, itemId, rawItem.itemSrNo);
      const visibleItem = schedule.awarded_items.find((item) => item.item_id === itemId);
      const hiddenUnit = normalizeItemRecord(rawItem).qty_unit;
      if (visibleItem && (!visibleItem.qty_unit || /^\d+$/.test(visibleItem.qty_unit))
        && hiddenUnit && !/^\d+$/.test(hiddenUnit)) {
        visibleItem.qty_unit = hiddenUnit;
      }
      if (itemId && !schedule.awarded_items.some((item) => item.item_id === itemId)) {
        const normalized = normalizeHiddenItemBreak(rawItem);
        schedule.awarded_items.push({ ...normalized, parent_schedule_id: schedule.schedule_id,
          view_details_target_id: visibleGroup?.view_details_target_id || '',
          bid_unit: compactText(rawItem.bidUnit ?? ''),
          escalation_text: formatEscalation(normalized.escalation_percent, rawItem.updationType) });
      }

      if (visibleGroup?.item_breaks?.length) {
        schedule.item_breaks.push(
          ...visibleGroup.item_breaks.map((item) => ({
            ...item,
            parent_awarded_item_id: itemId,
            parent_awarded_item_sno: compactText(rawItem.itemSrNo || ''),
            parent_awarded_item_desc: compactText(rawItem.itemDesc || visibleGroup.item_desc || ''),
            source: 'item_breakup'
          }))
        );
        return;
      }

      const normalizedItem = normalizeHiddenItemBreak(rawItem);
      if (hasItemData(normalizedItem)) {
        schedule.item_breaks.push(normalizedItem);
      }
    });
  });

  schedules.forEach((schedule) => {
    const viewDetailItem = schedule.awarded_items.find((awardedItem) => awardedItem.view_details_target_id);
    if (viewDetailItem?.item_desc) {
      schedule.schedule_item_directory = schedule.schedule_item_directory || schedule.item_directory;
      schedule.item_directory = viewDetailItem.item_desc;
    }

    schedule.awarded_items.forEach((awardedItem) => {
      if (schedule.item_breaks.some((item) => (item.parent_awarded_item_id || item.item_id) === awardedItem.item_id)) return;
      const visibleGroup = findVisibleGroup(schedule, awardedItem.view_details_target_id || awardedItem.item_id, awardedItem.item_sno);

      if (visibleGroup?.item_breaks?.length) {
        schedule.item_breaks.push(
          ...visibleGroup.item_breaks.map((item) => ({
            ...item,
            parent_awarded_item_id: awardedItem.item_id,
            parent_awarded_item_sno: awardedItem.item_sno,
            parent_awarded_item_desc: awardedItem.item_desc,
            source: 'item_breakup'
          }))
        );
        return;
      }

      if (hasItemData(awardedItem)) {
        schedule.item_breaks.push({
          ...ITEM_FIELDS.reduce((item, field) => {
            item[field] = awardedItem[field] || '';
            return item;
          }, {}),
          item_id: awardedItem.item_id,
          record_type: awardedItem.record_type,
          basic_value: awardedItem.basic_value,
          amount: awardedItem.bid_amount || awardedItem.advt_value || '',
          source: 'awarded_quantities'
        });
      }
    });
  });

  return schedules;
};

const extractItemBreakup = ($, hiddenValues) => {
  const scheduleBreakup = extractScheduleBreakup($, hiddenValues);
  if (scheduleBreakup.length) {
    return scheduleBreakup;
  }

  const hiddenBreakup = extractItemBreakupFromHiddenData(hiddenValues);
  return hiddenBreakup.length ? hiddenBreakup : extractItemBreakupFromTableRows($);
};

const recordKind = (recordType) => {
  const normalized = compactText(recordType);
  if (normalized === '50') {
    return 'schedule';
  }
  if (normalized === '51' || normalized === '55') {
    return 'part';
  }
  if (normalized === '56') {
    return 'item';
  }
  if (normalized === '57') {
    return 'lumpsum';
  }

  return normalized ? 'record' : '';
};

const findBreakupLinesForAwardedItem = (schedule, awardedItem) => {
  const targetId = awardedItem.view_details_target_id || awardedItem.item_id || '';
  const lines = schedule.item_breaks.filter((item) => {
    return item.source === 'item_breakup' && (!targetId || item.parent_awarded_item_id === targetId);
  });

  return lines.map((item) => {
    const qty = toNumberOrNull(item.item_qty);
    const rate = toNumberOrNull(item.unit_rate);
    const amount = toNumberOrNull(item.amount || item.advt_value);

    return {
      s_no: emptyToNull(item.item_sno),
      item_no: emptyToNull(item.item_code),
      description: compactText(item.item_desc),
      unit: emptyToNull(item.qty_unit),
      qty,
      rate,
      amount,
      is_heading: qty === null && rate === null && amount === null
    };
  });
};

const toAwardedChildNode = (schedule, awardedItem) => {
  const breakupLines = findBreakupLinesForAwardedItem(schedule, awardedItem);

  return {
    row_id: emptyToNull(awardedItem.item_id),
    rec_type: emptyToNull(awardedItem.record_type),
    kind: recordKind(awardedItem.record_type),
    item_sno: emptyToNull(awardedItem.item_sno),
    description: compactText(awardedItem.item_desc),
    item_code: emptyToNull(awardedItem.item_code),
    qty: toNumberOrNull(awardedItem.item_qty),
    unit: emptyToNull(awardedItem.qty_unit),
    schedule_rate: toNumberOrNull(awardedItem.unit_rate),
    bid_rate: toNumberOrNull(awardedItem.bid_rate_or_unit_rate),
    bid_amount: toNumberOrNull(awardedItem.bid_amount),
    amount: toNumberOrNull(awardedItem.advt_value),
    children: [],
    ...(breakupLines.length ? { breakup_lines: breakupLines } : {})
  };
};

const toDirectItemNode = (item) => {
  return {
    row_id: emptyToNull(item.item_id),
    rec_type: emptyToNull(item.record_type),
    kind: recordKind(item.record_type) || 'item',
    item_sno: emptyToNull(item.item_sno),
    description: compactText(item.item_desc),
    item_code: emptyToNull(item.item_code),
    qty: toNumberOrNull(item.item_qty),
    unit: emptyToNull(item.qty_unit),
    schedule_rate: toNumberOrNull(item.unit_rate),
    bid_rate: toNumberOrNull(item.bid_rate_or_unit_rate),
    bid_amount: toNumberOrNull(item.bid_amount),
    amount: toNumberOrNull(item.advt_value || item.amount),
    children: []
  };
};

const toReferenceScheduleNode = (schedule) => {
  const viewDetailChildren = schedule.awarded_items.map((awardedItem) => toAwardedChildNode(schedule, awardedItem));
  const directChildren = schedule.item_breaks
    .filter((item) => item.source !== 'item_breakup')
    .map((item) => toDirectItemNode(item));
  const children = viewDetailChildren.length ? viewDetailChildren : directChildren;

  return {
    row_id: emptyToNull(schedule.schedule_id),
    rec_type: emptyToNull(schedule.record_type),
    kind: recordKind(schedule.record_type) || 'schedule',
    item_sno: emptyToNull(schedule.item_sno),
    description: compactText(schedule.item_desc),
    item_code: null,
    qty: null,
    unit: null,
    schedule_rate: null,
    bid_rate: toNumberOrNull(schedule.bid_rate_or_unit_rate),
    bid_amount: toNumberOrNull(schedule.bid_amount),
    amount: toNumberOrNull(schedule.advt_value),
    children
  };
};

const extractLetterLines = ($) => {
  const stopWords = ['Awarded Quantities And Rates', 'Item Breakup'];
  const lines = [];
  const seen = new Set();

  $('body')
    .text()
    .split(/\r?\n/)
    .map((line) => compactText(line))
    .filter(Boolean)
    .some((line) => {
      if (stopWords.some((word) => line.includes(word))) {
        return true;
      }

      if (!seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }

      return false;
    });

  return lines;
};

const extractClausesFromLines = (lines) => {
  const clauseLabels = [
    'The Competent Authority',
    'A sum of Rs',
    'You are requested',
    'The entire work',
    'Contract Value:',
    'Shramik Portal:',
    'Conditions:',
    'Power of attorney:',
    'GST Compliance:',
    'Labour Registrations:',
    'Engineer in charge:',
    'Formal Agreement:',
    'Bar Chart:',
    'Legal charges:',
    'Copy to:',
    'All Other terms'
  ];

  const joined = lines.join(' ');
  const clauses = [];

  clauseLabels.forEach((label, index) => {
    const start = joined.indexOf(label);
    if (start === -1) {
      return;
    }

    const nextStarts = clauseLabels
      .slice(index + 1)
      .map((nextLabel) => joined.indexOf(nextLabel, start + label.length))
      .filter((position) => position !== -1);
    const end = nextStarts.length ? Math.min(...nextStarts) : joined.length;
    const clause = compactText(joined.slice(start, end));

    if (clause) {
      clauses.push(clause);
    }
  });

  return clauses.length ? clauses : lines.filter((line) => line.length > 80);
};

const createReferenceJson = ($, extracted, hiddenLoaData, scheduleBreakup, options = {}) => {
  const letterLines = extractLetterLines($);
  const signatoryBlock = letterLines.slice(-4).filter((line) => !/digitally signed|view signature/i.test(line));

  return {
    source_file: options.sourceFileName || '',
    letter: {
      letter_no_value: extracted.loa_no || '',
      nit_o_id: getElementValue($, ['input#nitOId', '#nitOId']),
      bid_id: extracted.bid_id || getElementValue($, VALUE_SELECTORS.bidId),
      post_id: getElementValue($, ['input#postId', '#postId']),
      td_id: getElementValue($, VALUE_SELECTORS.tdId),
      td_version: getElementValue($, VALUE_SELECTORS.tdVersion),
      bidder_acc_id: getElementValue($, ['input#bidderAccId', '#bidderAccId']),
      cert_thumbprint: getElementValue($, ['input#certThumbprint', '#certThumbprint']),
      header_lines: letterLines,
      signatory_block: signatoryBlock,
      clauses: extractClausesFromLines(letterLines)
    },
    awarded_quantities_rates: {
      schedules: scheduleBreakup.map((schedule) => toReferenceScheduleNode(schedule))
    }
  };
};

const nullifyBlankValues = (value) => {
  if (typeof value === 'string') return !value.trim() || value.trim().toLowerCase() === 'null' ? null : value;
  if (Array.isArray(value)) return value.map(nullifyBlankValues);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, nullifyBlankValues(child)]));
  }
  return value;
};

export const parseLoaHtml = (html, options = {}) => {
  const $ = cheerio.load(html, { decodeEntities: false });
  const bodyTextWithLines = normalizeText($('body').text());
  const compactBodyText = compactText(bodyTextWithLines);
  const hiddenLoaData = extractHiddenJsonData($);
  const hiddenValues = Object.values(hiddenLoaData);
  const letterHeader = getLetterHeader($);
  const tenderReference = getTenderReference($);
  const visibleContractor = getContractorDetails($);

  const letterNoFull =
    letterHeader.letter_no_full ||
    getElementValue($, VALUE_SELECTORS.letterNo) ||
    findValueByLabels($, ['letter no', 'loa no', 'letter number']) ||
    findDeepValue(hiddenValues, [/letter.*no/i, /loa.*no/i]) ||
    findRegexValue(bodyTextWithLines, [
      /Letter\s*No\.?\s*[:\-]?\s*([^\n\r]+)/i,
      /LOA\s*No\.?\s*[:\-]?\s*([^\n\r]+)/i
    ]);

  const loaNo =
    extractLoaNumberFromLetterNo(letterNoFull) ||
    findRegexValue(compactBodyText, [
      /Letter\s*No\.?\s*[:\-]?\s*(?:[^/]+\/){1,}\s*([A-Z0-9-]{5,})/i,
      /LOA\s*No\.?\s*[:\-]?\s*([A-Z0-9-]{5,})/i
    ]);

  const tenderNo =
    tenderReference.tender_no ||
    findValueByLabels($, ['tender no', 'tender number', 'nit no', 'tender id']) ||
    findDeepValue(hiddenValues, [/tender.*no/i, /tender.*id/i, /nit.*no/i]) ||
    findRegexValue(bodyTextWithLines, [
      /Tender\s*(?:No|Number|ID)\.?\s*[:\-]?\s*([^\n\r]+)/i,
      /NIT\s*No\.?\s*[:\-]?\s*([^\n\r]+)/i
    ]);

  const bidId =
    getElementValue($, VALUE_SELECTORS.bidId) ||
    findValueByLabels($, ['bid id', 'bid no', 'bid number']) ||
    findDeepValue(hiddenValues, [/bid.*id/i, /bid.*no/i]) ||
    findRegexValue(bodyTextWithLines, [/Bid\s*(?:ID|No|Number)\.?\s*[:\-]?\s*([^\n\r]+)/i]);

  const contractorName =
    visibleContractor.name ||
    findValueByLabels($, [
      'contractor name',
      'vendor name',
      'firm name',
      'supplier name',
      'contractor'
    ]) ||
    findDeepValue(hiddenValues, [/contractor.*name/i, /vendor.*name/i, /firm.*name/i, /supplier.*name/i]);

  const contractorAddress =
    visibleContractor.address ||
    findValueByLabels($, [
      'contractor address',
      'vendor address',
      'firm address',
      'supplier address',
      'address'
    ]) || findDeepValue(hiddenValues, [/contractor.*address/i, /vendor.*address/i, /firm.*address/i, /address/i]);

  const letterDate =
    tenderReference.letter_date ||
    getElementValue($, VALUE_SELECTORS.letterDate) ||
    findValueByLabels($, ['letter date', 'loa date', 'date']) ||
    findDeepValue(hiddenValues, [/letter.*date/i, /loa.*date/i, /^date$/i]) ||
    findRegexValue(bodyTextWithLines, [
      /(?:Letter\s*)?Date\s*[:\-]?\s*([0-3]?\d[./-][01]?\d[./-]\d{2,4})/i,
      /(?:Letter\s*)?Date\s*[:\-]?\s*(\d{4}[./-][01]?\d[./-][0-3]?\d)/i
    ]);

  const loaDate =
    letterHeader.loa_date ||
    findValueByLabels($, ['loa date', 'letter of acceptance date']) ||
    findRegexValue(bodyTextWithLines, [
      /\bDated\s*:\s*([0-3]?\d[./-][01]?\d[./-]\d{2,4})/i
    ]);

  const tenderValidUptoDate = tenderReference.tender_valid_upto_date;

  const workDescription =
    tenderReference.work_description ||
    findValueByLabels($, [
      'work description',
      'description of work',
      'name of work',
      'work name',
      'description'
    ]) ||
    findDeepValue(hiddenValues, [/work.*description/i, /description.*work/i, /work.*name/i]) ||
    findRegexValue(bodyTextWithLines, [
      /(?:Description\s*of\s*Work|Work\s*Description|Name\s*of\s*Work)\s*[:\-]?\s*([^\n\r]+)/i
    ]);

  const contractValueRaw =
    findValueByLabels($, [
      'contract value',
      'loa value',
      'accepted value',
      'total value',
      'agreement value'
    ]) ||
    findDeepValue(hiddenValues, [/contract.*value/i, /loa.*value/i, /accepted.*value/i, /total.*value/i]) ||
    findRegexValue(bodyTextWithLines, [
      /(?:Contract|LOA|Accepted|Agreement)\s*Value\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.\d+)?)/i
    ]);

  const emdAmountRaw =
    findRegexValue(compactBodyText, [
      /A\s+sum\s+of\s+(?:Rs\.?|INR|â‚¹)?\s*([0-9,]+(?:\.\d+)?)\s+deposited\s+as\s+Earnest\s+Money/i,
      /Earnest\s*Money(?:\s*Deposit)?.{0,80}?(?:Rs\.?|INR|â‚¹)\s*([0-9,]+(?:\.\d+)?)/i
    ]) ||
    findValueByLabels($, ['emd amount', 'earnest money', 'earnest money deposit', 'emd']) ||
    findDeepValue(hiddenValues, [/emd/i, /earnest.*money/i]) ||
    findRegexValue(bodyTextWithLines, [
      /(?:EMD|Earnest\s*Money(?:\s*Deposit)?)\s*(?:Amount)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.\d+)?)/i
    ]);

  const performanceGuaranteeRaw =
    findRegexValue(compactBodyText, [
      /Performance\s+Guarantee.{0,400}?amounting\s+to\s+(?:Rs\.?|INR|â‚¹)?\s*([0-9,]+(?:\.\d+)?)/i
    ]) ||
    findValueByLabels($, [
      'performance guarantee amount',
      'performance guarantee',
      'pg amount',
      'security deposit'
    ]) ||
    findDeepValue(hiddenValues, [/performance.*guarantee/i, /^pg.*amount/i, /security.*deposit/i]) ||
    findRegexValue(bodyTextWithLines, [
      /(?:Performance\s*Guarantee|PG|Security\s*Deposit)\s*(?:Amount)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.\d+)?)/i
    ]);

  const completionPeriod =
    findRegexValue(compactBodyText, [
      /entire\s+work\s+shall\s+be\s+completed\s+within\s+(\d+)\s*months?/i
    ]) ||
    findValueByLabels($, ['completion period', 'period of completion', 'delivery period', 'contract period']) ||
    findDeepValue(hiddenValues, [/completion.*period/i, /period.*completion/i, /delivery.*period/i]) ||
    findRegexValue(bodyTextWithLines, [
      /(?:Completion\s*Period|Period\s*of\s*Completion|Delivery\s*Period)\s*[:\-]?\s*([^\n\r]+)/i
    ]);

  const completionMonths = Number.parseInt(completionPeriod, 10);
  const normalizedCompletionPeriod = Number.isFinite(completionMonths) ? `${completionMonths} Months` : completionPeriod;
  const completionDate = addMonthsToDate(loaDate, completionMonths);
  const rebateRate =
    getElementValue($, ['input#rebate', '#rebateSpan']) ||
    findRegexValue(compactBodyText, [
      /Rebate\s+on\s+Total\s+Value\s*\(%\)\s*([0-9]+(?:\.\d+)?)/i
    ]);

  const railwayDetails = getRailwayDetails($, hiddenValues);
  const tdId = getElementValue($, VALUE_SELECTORS.tdId) || findDeepValue(hiddenValues, [/^td.*id$/i]);
  const tdVersion =
    getElementValue($, VALUE_SELECTORS.tdVersion) || findDeepValue(hiddenValues, [/^td.*version$/i]);
  const itemBreakup = extractItemBreakup($, hiddenValues);
  const summaryExtracted = {
    loa_no: loaNo,
    letter_no_full: letterNoFull,
    tender_no: tenderNo,
    bid_id: bidId,
    contractor_name: contractorName,
    letter_date: letterDate,
    contract_value: parseAmount(contractValueRaw)
  };

  const extracted = {
    loa_no: loaNo,
    letter_no_full: letterNoFull,
    letter_date: letterDate,
    loa_date: normalizeDate(loaDate),
    completion_date: completionDate,
    tender_valid_upto_date: tenderValidUptoDate,
    railway_details: railwayDetails,
    contractor: {
      name: contractorName,
      address: contractorAddress
    },
    tender_no: tenderNo,
    bid_id: bidId,
    td_id: tdId,
    td_version: tdVersion,
    work_description: workDescription,
    contract_value: {
      raw: contractValueRaw,
      amount: parseAmount(contractValueRaw)
    },
    emd_amount: {
      raw: emdAmountRaw,
      amount: parseAmount(emdAmountRaw)
    },
    performance_guarantee_amount: {
      raw: performanceGuaranteeRaw,
      amount: parseAmount(performanceGuaranteeRaw)
    },
    completion_period: normalizedCompletionPeriod,
    rebate_rate: toNumberOrNull(rebateRate),
    schedule_breakup: itemBreakup,
    item_breakup: itemBreakup,
    important_conditions: extractImportantConditions($),
    hidden_loa_data: hiddenLoaData
  };
  // Preserve unfamiliar columns/sections without guessing their business meaning.
  extracted.source_tables = $('table').toArray().map((table, index) => ({
    table_index: index, table_id: $(table).attr('id') || '',
    rows: tableRows($, table).map(({ cells }) => cells).filter((cells) => cells.some(Boolean))
  })).filter((table) => table.rows.length);
  extracted.parse_warnings = itemBreakup.length ? [] : ['No structured schedules were recognized. Original tables are retained in source_tables.'];
  const loaFull = createReferenceJson($, summaryExtracted, hiddenLoaData, itemBreakup, options);
  extracted.source_file = loaFull.source_file;
  extracted.letter = loaFull.letter;
  extracted.awarded_quantities_rates = loaFull.awarded_quantities_rates;
  extracted.loa_full = loaFull;

  return nullifyBlankValues({
    loa_no: loaNo,
    letter_no_full: letterNoFull,
    tender_no: tenderNo,
    bid_id: bidId,
    contractor_name: contractorName,
    letter_date: letterDate,
    contract_value: summaryExtracted.contract_value,
    json_data: extracted
  });
};
