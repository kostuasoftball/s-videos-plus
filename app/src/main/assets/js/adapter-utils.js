(function sisiplusAdapterUtils(global) {
  'use strict';

  const app = global.SisiPlus = global.SisiPlus || {};
  const COUNTRY_NAMES = {
    all: 'Все страны', ru: 'Россия / русский', ua: 'Украина / украинский', by: 'Беларусь',
    kz: 'Казахстан', us: 'США / английский', gb: 'Великобритания', de: 'Германия / немецкий',
    fr: 'Франция / французский', es: 'Испания / испанский', it: 'Италия / итальянский',
    br: 'Бразилия / португальский', co: 'Колумбия', mx: 'Мексика', ar: 'Аргентина',
    pl: 'Польша / польский', cz: 'Чехия', ro: 'Румыния', nl: 'Нидерланды',
    jp: 'Япония / японский', cn: 'Китай', kr: 'Корея', in: 'Индия', ph: 'Филиппины'
  };
  const COUNTRY_OPTIONS = Object.keys(COUNTRY_NAMES).map((id) => ({ id, title: COUNTRY_NAMES[id] }));
  const STRIPCHAT_COUNTRY_NAMES = {
    ca: "Канада", ve: "Венесуэла", pe: "Перу", cl: "Чили", ec: "Эквадор",
    au: "Австралия", bd: "Бангладеш", vn: "Вьетнам", my: "Малайзия", th: "Таиланд", lk: "Шри-Ланка",
    at: "Австрия", be: "Бельгия", hu: "Венгрия", gr: "Греция", ge: "Грузия", dk: "Дания", lv: "Латвия", rs: "Сербия", se: "Швеция", ch: "Швейцария",
    eg: "Египет", zw: "Зимбабве", ke: "Кения", mg: "Мадагаскар", ma: "Марокко", ng: "Нигерия", ug: "Уганда", za: "ЮАР",
    eu: "Европа", af: "Африка", arab: "Арабские страны", scandinavian: "Скандинавия", tr: "Турция", pt: "Португалия"
  };
  // Один плоский список для Lampa: заголовок континента и сразу страны под ним.
  // heading не является значением фильтра и обрабатывается UI как неактивный пункт.
  const STRIPCHAT_COUNTRY_GROUPS = [
    ["Северная Америка", [["us", "Американки"], ["ca", "Канадки"], ["mx", "Мексиканки"]]],
    ["Южная Америка", [["ar", "Аргентинки"], ["br", "Бразильянки"], ["ve", "Венесуэлки"], ["co", "Колумбийки"], ["pe", "Перуанки"], ["cl", "Чилийки"], ["ec", "Эквадорки"]]],
    ["Азия и Океания", [["au", "Австралийки"], ["bd", "Бангладеш"], ["vn", "Вьетнамки"], ["in", "Индианки"], ["cn", "Китаянки"], ["my", "Малайзийки"], ["th", "Тайки"], ["ph", "Филиппинки"], ["lk", "Шри-ланкийки"], ["jp", "Японки"], ["kr", "Корейки"]]],
    ["Европа", [["at", "Австрийки"], ["be", "Бельгийки"], ["gb", "Британские модели"], ["hu", "Венгерки"], ["nl", "Голландки"], ["gr", "Гречанки"], ["ge", "Грузинки"], ["dk", "Датчанки"], ["eu", "Европейки"], ["es", "Испанки"], ["it", "Итальянки"], ["lv", "Латышки"], ["de", "Немки"], ["pl", "Польки"], ["pt", "Португалки"], ["ro", "Румынки"], ["rs", "Сербки"], ["scandinavian", "Скандинавки"], ["ua", "Украинки"], ["fr", "Француженки"], ["cz", "Чешки"], ["se", "Шведки"], ["ch", "Швейцарки"]]],
    ["Африка", [["af", "Африканки"], ["eg", "Египтянки"], ["zw", "Зимбабвийки"], ["ke", "Кенийки"], ["mg", "Малагасийки"], ["ma", "Марокканки"], ["ng", "Нигерийки"], ["ug", "Угандийки"], ["za", "Южноафриканки"]]],
    ["Ближний Восток", [["arab", "Арабки"], ["tr", "Турчанки"]]]
  ];
  const STRIPCHAT_COUNTRY_OPTIONS = [
    { id: "all", title: "Все страны" },
    ...STRIPCHAT_COUNTRY_GROUPS.flatMap(([title, countries]) => [
      { id: "heading:" + title, title, heading: true, separator: true, disabled: true },
      ...countries.map(([id, title]) => ({ id, title }))
    ])
  ];

  function decodeHtml(value) {
    const text = String(value || '');
    if (typeof document !== 'undefined') {
      const node = document.createElement('textarea');
      node.innerHTML = text;
      return node.value;
    }
    return text
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  function stripTags(value) { return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
  function absolute(base, value) {
    if (!value) return '';
    try { return new URL(decodeHtml(value).replace(/\\\//g, '/'), base).href; }
    catch (error) { return ''; }
  }
  function duration(value) {
    const parts = String(value || '').trim().split(':').map(Number);
    if (!parts.length || parts.some(Number.isNaN)) return 0;
    return parts.reduce((sum, part) => sum * 60 + part, 0);
  }
  function result(items, page, totalPages) {
    return { items: items || [], page: Math.max(1, Number(page) || 1), totalPages: Math.max(1, Number(totalPages) || 1) };
  }
  function findObject(root, paths) {
    for (const path of paths) {
      let value = root;
      for (const key of path.split('.')) value = value && value[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }
  function extractAssignedJson(text, marker) {
    const startMarker = text.indexOf(marker);
    if (startMarker < 0) return null;
    let start = startMarker + marker.length;
    while (/\s/.test(text[start] || '')) start += 1;
    const open = text[start];
    const close = open === '{' ? '}' : open === '[' ? ']' : '';
    if (!close) return null;
    let depth = 0;
    let quote = '';
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === open) depth += 1;
      if (char === close) {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, index + 1)); }
          catch (error) { return null; }
        }
      }
    }
    return null;
  }
  function countryLabel(code) {
    const normalized = String(code || '').toLowerCase();
    return COUNTRY_NAMES[normalized] || STRIPCHAT_COUNTRY_NAMES[normalized] || normalized.toUpperCase();
  }
  function countryFilter(options = COUNTRY_OPTIONS) {
    return { id: 'country', title: 'Страна / национальность', options };
  }
  function stripchatCountryFilter() {
    return { id: "country", title: "Страны и национальности", options: STRIPCHAT_COUNTRY_OPTIONS };
  }
  function normalizeCountry(value) {
    const lang = String(value || "").trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
    const map = {
      ru: "ru", russian: "ru", russia: "ru", ukrainian: "ua", ukraine: "ua", ua: "ua", belarusian: "by", belarus: "by", kazakh: "kz", kazakhstan: "kz",
      american: "us", "united states": "us", usa: "us", english: "us", canadian: "ca", canada: "ca", mexican: "mx", mexico: "mx", argentinian: "ar", argentine: "ar", brazilian: "br", venezuelan: "ve", colombian: "co", peruvian: "pe", chilean: "cl", ecuadorian: "ec",
      australian: "au", bangladeshi: "bd", vietnamese: "vn", indian: "in", hindi: "in", chinese: "cn", malaysian: "my", thai: "th", filipino: "ph", philippine: "ph", "sri lankan": "lk", japanese: "jp", korean: "kr",
      austrian: "at", belgian: "be", british: "gb", "great britain": "gb", german: "de", polish: "pl", portuguese: "pt", romanian: "ro", serbian: "rs", scandinavian: "scandinavian", greek: "gr", georgian: "ge", danish: "dk", dutch: "nl", spanish: "es", italian: "it", latvian: "lv", french: "fr", czech: "cz", swedish: "se", swiss: "ch", european: "eu",
      african: "af", egyptian: "eg", zimbabwean: "zw", kenyan: "ke", malagasy: "mg", moroccan: "ma", nigerian: "ng", ugandan: "ug", "south african": "za", arab: "arab", arabic: "arab", turkish: "tr"
    };
    if (Object.prototype.hasOwnProperty.call(map, lang)) return map[lang];
    return Object.prototype.hasOwnProperty.call(COUNTRY_NAMES, lang) || Object.prototype.hasOwnProperty.call(STRIPCHAT_COUNTRY_NAMES, lang) ? lang : "";
  }
  // BongaCams/Runetki передают язык, а не страну. Сохраняем прежнее соответствие
  // португальского языка Бразилии; национальность Stripchat обрабатывается отдельно.
  function normalizeLanguage(value) {
    const lang = String(value || '').trim().toLowerCase();
    if (lang === 'portuguese') return 'br';
    return normalizeCountry(value);
  }

  app.AdapterUtils = {
    COUNTRY_NAMES,
    COUNTRY_OPTIONS,
    STRIPCHAT_COUNTRY_GROUPS,
    STRIPCHAT_COUNTRY_OPTIONS,
    decodeHtml,
    stripTags,
    absolute,
    duration,
    result,
    findObject,
    extractAssignedJson,
    countryLabel,
    countryFilter,
    stripchatCountryFilter,
    normalizeCountry,
    normalizeLanguage
  };
})(window);
