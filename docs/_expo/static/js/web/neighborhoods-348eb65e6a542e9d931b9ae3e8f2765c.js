__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "DEFAULT_HASAHISA_LOCATIONS", {
    enumerable: true,
    get: function () {
      return DEFAULT_HASAHISA_LOCATIONS;
    }
  });
  exports.loadLocations = loadLocations;
  exports.saveLocations = saveLocations;
  exports.addLocation = addLocation;
  exports.deleteLocation = deleteLocation;
  exports.updateLocation = updateLocation;
  Object.defineProperty(exports, "HASAHISA_LOCATIONS", {
    enumerable: true,
    get: function () {
      return HASAHISA_LOCATIONS;
    }
  });
  Object.defineProperty(exports, "NEIGHBORHOODS", {
    enumerable: true,
    get: function () {
      return NEIGHBORHOODS;
    }
  });
  Object.defineProperty(exports, "VILLAGES", {
    enumerable: true,
    get: function () {
      return VILLAGES;
    }
  });
  var _reactNativeAsyncStorageAsyncStorage = require(_dependencyMap[0]);
  var AsyncStorage = _interopDefault(_reactNativeAsyncStorageAsyncStorage);
  // ────────────────────────────────────────────────────────────────────────────
  // مصدر البيانات: ويكيبيديا العربية — مقالة "الحصاحيصا"
  // https://ar.wikipedia.org/wiki/الحصاحيصا
  // ────────────────────────────────────────────────────────────────────────────

  const DEFAULT_HASAHISA_LOCATIONS = [
  // ── أحياء مدينة الحصاحيصا (المصدر: ويكيبيديا) ────────────────────────
  {
    label: "الحي الشرقي",
    type: "neighborhood"
  }, {
    label: "الحي الأوسط",
    type: "neighborhood"
  }, {
    label: "حي الواحة",
    type: "neighborhood"
  }, {
    label: "حي الصفاء",
    type: "neighborhood"
  }, {
    label: "حي الزهور",
    type: "neighborhood"
  }, {
    label: "حي العمدة",
    type: "neighborhood"
  }, {
    label: "حي الموظفين",
    type: "neighborhood"
  }, {
    label: "حي كريمة",
    type: "neighborhood"
  }, {
    label: "حي الفيحاء",
    type: "neighborhood"
  }, {
    label: "حي الصداقة",
    type: "neighborhood"
  }, {
    label: "حي المايقوما",
    type: "neighborhood"
  }, {
    label: "حي الضقالة",
    type: "neighborhood"
  }, {
    label: "حي فور",
    type: "neighborhood"
  }, {
    label: "الامتداد",
    type: "neighborhood"
  }, {
    label: "الحلة الجديدة",
    type: "neighborhood"
  }, {
    label: "المنصورة",
    type: "neighborhood"
  }, {
    label: "المزاد",
    type: "neighborhood"
  }, {
    label: "الكرمك",
    type: "neighborhood"
  }, {
    label: "كمبو المحالج",
    type: "neighborhood"
  }, {
    label: "الجملونات",
    type: "neighborhood"
  }, {
    label: "الطائف",
    type: "neighborhood"
  }, {
    label: "ود الكامل",
    type: "neighborhood"
  }, {
    label: "أركويت",
    type: "neighborhood"
  },
  // ── مناطق وأحياء فرعية (مستخلصة من أندية رياضية ومصادر محلية) ─────────
  {
    label: "الطالباب",
    type: "neighborhood"
  }, {
    label: "الكشامر",
    type: "neighborhood"
  }, {
    label: "أم دغينة",
    type: "neighborhood"
  }, {
    label: "أم عضام",
    type: "neighborhood"
  }, {
    label: "ود السيد",
    type: "neighborhood"
  }, {
    label: "أبو فروع",
    type: "neighborhood"
  }, {
    label: "عمارة أبيد",
    type: "neighborhood"
  }, {
    label: "ود سلفاب",
    type: "neighborhood"
  }, {
    label: "ود الفادني",
    type: "neighborhood"
  }, {
    label: "أبو جيلي",
    type: "neighborhood"
  }, {
    label: "ودشمو",
    type: "neighborhood"
  }, {
    label: "أربجي",
    type: "neighborhood"
  },
  // ── قرى ووحدات إدارية تابعة لمحلية الحصاحيصا ──────────────────────────
  {
    label: "المسلمية",
    type: "village"
  }, {
    label: "ود حبوبة",
    type: "village"
  }, {
    label: "أبو قوتة",
    type: "village"
  }, {
    label: "الربع",
    type: "village"
  }, {
    label: "طابت",
    type: "village"
  }, {
    label: "المحيريبا",
    type: "village"
  }, {
    label: "قرية الولي",
    type: "village"
  }, {
    label: "ود بهاي",
    type: "village"
  }, {
    label: "طيبة الشيخ القرشي",
    type: "village"
  }, {
    label: "كبنة",
    type: "village"
  }, {
    label: "تنة",
    type: "village"
  }, {
    label: "بانت",
    type: "village"
  }, {
    label: "الجلاد",
    type: "village"
  }, {
    label: "ود العباس",
    type: "village"
  }, {
    label: "طابية",
    type: "village"
  }, {
    label: "بمبان",
    type: "village"
  }, {
    label: "هيصة",
    type: "village"
  }, {
    label: "ود النيل",
    type: "village"
  }, {
    label: "أم ضباع",
    type: "village"
  }, {
    label: "حلفاية الحصاحيصا",
    type: "village"
  }, {
    label: "الشيخ حماد",
    type: "village"
  }, {
    label: "الشيخ طيب",
    type: "village"
  }, {
    label: "ود بلال",
    type: "village"
  }, {
    label: "أبو عشر",
    type: "village"
  }, {
    label: "الدوينيب",
    type: "village"
  },
  // ── خيار عام ────────────────────────────────────────────────────────────
  {
    label: "أخرى / خارج الحصاحيصا",
    type: "village"
  }];
  const STORAGE_KEY = "hasahisawi_neighborhoods_v2";
  async function loadLocations() {
    try {
      const raw = await AsyncStorage.default.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_HASAHISA_LOCATIONS;
  }
  async function saveLocations(items) {
    await AsyncStorage.default.setItem(STORAGE_KEY, JSON.stringify(items));
  }
  async function addLocation(item) {
    const current = await loadLocations();
    const updated = [...current, item];
    await saveLocations(updated);
    return updated;
  }
  async function deleteLocation(label) {
    const current = await loadLocations();
    const updated = current.filter(l => l.label !== label);
    await saveLocations(updated);
    return updated;
  }
  async function updateLocation(oldLabel, newItem) {
    const current = await loadLocations();
    const updated = current.map(l => l.label === oldLabel ? newItem : l);
    await saveLocations(updated);
    return updated;
  }
  const HASAHISA_LOCATIONS = DEFAULT_HASAHISA_LOCATIONS;
  const NEIGHBORHOODS = DEFAULT_HASAHISA_LOCATIONS.filter(l => l.type === "neighborhood").map(l => l.label);
  const VILLAGES = DEFAULT_HASAHISA_LOCATIONS.filter(l => l.type === "village").map(l => l.label);
},1994,[2114]);