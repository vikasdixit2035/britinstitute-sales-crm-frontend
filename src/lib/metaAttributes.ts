import type { Lead, MetaAttribute } from '../types';

const IGNORED_KEYS = new Set([
  'id',
  'leadid',
  'leadgenid',
  'metaleadid',
  'formid',
  'pageid',
  'adid',
  'campaignid',
  'adsetid',
  'metafbc',
  'metafbp',
  'name',
  'fullname',
  'firstname',
  'lastname',
  'email',
  'phone',
  'phonenumber',
  'whatsapp',
  'whatsappnumber',
  'zoomphonenumber',
  'campaignname',
  'adsetname',
  'adname',
  'createdtime',
  'datecreated',
  'folder',
  'source',
  'status',
  'priority',
  'rawpayload',
  'metarawpayload',
  'fielddata',
  'mappablefielddata',
  'customfields',
  'formfields',
  'metaattributes',
  'attributes',
  'feedback',
  'metafeedbacklaststatus',
  'metafeedbacklastsentat',
  'metafeedbacklasterror',
  'apikey',
  'xapikey',
  'createdat',
  'updatedat',
  'v',
  '_v',
  '__v',
  'notes',
  'assignedto',
  'assignedby',
  'assignmenthistory',
  'leadscore',
]);

const QUESTION_WORDS = new Set([
  'what',
  'when',
  'why',
  'where',
  'how',
  'who',
  'which',
  'whose',
  'whom',
  'are',
  'do',
  'does',
  'did',
  'is',
  'can',
  'could',
  'will',
  'would',
  'have',
  'has',
  'should',
]);

const ACRONYMS: Record<string, string> = {
  ged: 'GED',
  id: 'ID',
  crm: 'CRM',
  uk: 'UK',
  us: 'US',
  usa: 'USA',
  vps: 'VPS',
  it: 'IT',
  hr: 'HR',
  api: 'API',
  url: 'URL',
  ai: 'AI',
  qa: 'QA',
};

const normalizeLookupKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

export const formatMetaAttributeLabel = (key: string): string => {
  if (!key) return '';
  const trimmed = key.trim();
  const hasQuestionMark = trimmed.endsWith('?');
  const cleanKey = trimmed.replace(/\?+$/, '');

  const words = cleanKey
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[\-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return trimmed;

  const firstWordLower = words[0].toLowerCase();
  const isQuestion = hasQuestionMark || QUESTION_WORDS.has(firstWordLower);

  if (isQuestion) {
    const formattedWords = words.map((w, idx) => {
      const lower = w.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (lower === 'i') return 'I';
      if (idx === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    });
    return `${formattedWords.join(' ')}?`;
  }

  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

export const formatMetaAttributeValue = (value: unknown): { value: string; rawValue: string } => {
  if (value === null || value === undefined) {
    return { value: '', rawValue: '' };
  }

  if (Array.isArray(value)) {
    const formattedItems = value
      .map((item) => formatMetaAttributeValue(item))
      .filter((res) => Boolean(res.value));
    return {
      value: formattedItems.map((item) => item.value).join(', '),
      rawValue: formattedItems.map((item) => item.rawValue).join(', '),
    };
  }

  if (typeof value === 'boolean') {
    return { value: value ? 'Yes' : 'No', rawValue: String(value) };
  }

  if (typeof value === 'number') {
    return { value: String(value), rawValue: String(value) };
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('value' in obj || 'Value' in obj) {
      return formatMetaAttributeValue(obj.value ?? obj.Value);
    }
    if ('values' in obj || 'Values' in obj) {
      return formatMetaAttributeValue(obj.values ?? obj.Values);
    }
    const str = JSON.stringify(value);
    return { value: str, rawValue: str };
  }

  const rawString = String(value).trim();
  if (!rawString) return { value: '', rawValue: '' };

  if (/\s|\/|[A-Z]/.test(rawString)) {
    return { value: rawString, rawValue: rawString };
  }

  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(rawString)) {
    const parts = rawString.split('_');
    const titleized = parts
      .map((p, idx) => {
        if (ACRONYMS[p]) return ACRONYMS[p];
        if (idx === 0) return p.charAt(0).toUpperCase() + p.slice(1);
        return p;
      })
      .join(' ');
    return { value: titleized, rawValue: rawString };
  }

  if (/^[a-z]+$/.test(rawString)) {
    return {
      value: rawString.charAt(0).toUpperCase() + rawString.slice(1),
      rawValue: rawString,
    };
  }

  return { value: rawString, rawValue: rawString };
};

export const extractMetaAttributesFromPayload = (
  payload?: Record<string, unknown>
): MetaAttribute[] => {
  if (!payload || typeof payload !== 'object') return [];

  const result: MetaAttribute[] = [];
  const seen = new Set<string>();

  const addCandidate = (rawKey: unknown, rawVal: unknown, customLabel?: string) => {
    if (!rawKey || typeof rawKey !== 'string') return;
    const key = rawKey.trim();
    if (!key) return;

    const normalizedKey = normalizeLookupKey(key);
    if (IGNORED_KEYS.has(normalizedKey)) return;
    if (seen.has(normalizedKey)) return;

    const { value, rawValue } = formatMetaAttributeValue(rawVal);
    if (!value) return;

    seen.add(normalizedKey);
    result.push({
      key,
      label: customLabel?.trim() || formatMetaAttributeLabel(key),
      value,
      rawValue: rawValue || value,
    });
  };

  // 1. Explicit attributes container
  const explicitAttributes =
    payload.metaAttributes || payload.attributes || payload.customFields || payload.formFields;
  if (Array.isArray(explicitAttributes)) {
    for (const item of explicitAttributes) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const k = rec.key || rec.name || rec.label || rec.field;
      const v = rec.value ?? rec.values;
      const label = typeof rec.label === 'string' ? rec.label : undefined;
      addCandidate(k, v, label);
    }
  } else if (explicitAttributes && typeof explicitAttributes === 'object') {
    for (const [k, v] of Object.entries(explicitAttributes as Record<string, unknown>)) {
      addCandidate(k, v);
    }
  }

  // 2. mappableFieldData / mappable_field_data (Make Array: [{ Name, Value }])
  const mappable = payload.mappableFieldData || payload.mappable_field_data;
  if (Array.isArray(mappable)) {
    for (const item of mappable) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const k = rec.Name ?? rec.name ?? rec.key ?? rec.field;
      const v = rec.Value ?? rec.value ?? rec.values;
      addCandidate(k, v);
    }
  }

  // 3. fieldData / field_data (Array or Object)
  const fieldData = payload.fieldData || payload.field_data;
  if (Array.isArray(fieldData)) {
    for (const item of fieldData) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const k = rec.name ?? rec.Name ?? rec.key;
      const v = rec.values ?? rec.value ?? rec.Value;
      addCandidate(k, v);
    }
  } else if (fieldData && typeof fieldData === 'object') {
    for (const [k, v] of Object.entries(fieldData as Record<string, unknown>)) {
      addCandidate(k, v);
    }
  }

  // 4. Root-level custom keys
  for (const [k, v] of Object.entries(payload)) {
    addCandidate(k, v);
  }

  return result;
};

export const getLeadMetaAttributes = (lead: Lead): MetaAttribute[] => {
  if (lead.metaAttributes && Array.isArray(lead.metaAttributes) && lead.metaAttributes.length > 0) {
    return lead.metaAttributes;
  }
  if (lead.metaRawPayload) {
    return extractMetaAttributesFromPayload(lead.metaRawPayload);
  }
  return [];
};
