(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NukePresets = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Verified historical & reference nuclear weapon yields (Wikipedia: Nuclear weapon yield)
  const WEAPON_PRESETS = [
    {
      id: 'davy-crockett',
      name: 'Davy Crockett',
      cnName: '戴维·克罗克特 (战术)',
      yieldKt: 0.02,
      defaultBurst: 'airburst',
      era: '1961 (冷战战术)',
      desc: '历史上最小的实用化战术核装置之一，当量 20 吨 TNT。'
    },
    {
      id: 'little-boy',
      name: 'Little Boy',
      cnName: '“小男孩” (广岛)',
      yieldKt: 15,
      defaultBurst: 'airburst',
      era: '1945 (铀-235 枪式)',
      desc: '1945 年广岛空爆，估算当量约 15 千吨 TNT。'
    },
    {
      id: 'fat-man',
      name: 'Fat Man',
      cnName: '“胖子” (长崎)',
      yieldKt: 21,
      defaultBurst: 'airburst',
      era: '1945 (钚-239 内爆式)',
      desc: '1945 年长崎空爆，估算当量约 21 千吨 TNT。'
    },
    {
      id: 'w76',
      name: 'W76 Warhead',
      cnName: 'W76 潜射弹头',
      yieldKt: 100,
      defaultBurst: 'airburst',
      era: '现代战略分导',
      desc: '典型潜射洲际导弹分导核弹头，当量 100 千吨 TNT。'
    },
    {
      id: 'w87',
      name: 'W87 Warhead',
      cnName: 'W87 洲际弹头',
      yieldKt: 300,
      defaultBurst: 'airburst',
      era: '现代陆基战略',
      desc: '陆基洲际弹道导弹分导热核弹头，当量 300 千吨 TNT。'
    },
    {
      id: 'b83',
      name: 'B83 Bomb',
      cnName: 'B83 重型核航弹',
      yieldKt: 1200,
      defaultBurst: 'airburst',
      era: '1983 (可变当量上限)',
      desc: '美军现役最大当量自由落体热核航弹，最大 1.2 百万吨。'
    },
    {
      id: 'castle-bravo',
      name: 'Castle Bravo',
      cnName: '城堡行动·布拉沃',
      yieldKt: 15000,
      defaultBurst: 'surface',
      era: '1954 (美国最大核试验)',
      desc: '比基尼环礁地爆试验，因锂-7 副反应实际当量达 15 百万吨。'
    },
    {
      id: 'tsar-bomba',
      name: 'Tsar Bomba',
      cnName: '“沙皇炸弹” (AN602)',
      yieldKt: 50000,
      defaultBurst: 'airburst',
      era: '1961 (人类历史最大)',
      desc: '苏联新地岛高空试验，实测当量约 50 百万吨 TNT。'
    }
  ];

  // Verified city coordinates (decimal degrees)
  const CITY_PRESETS = [
    { id: 'beijing', name: '北京 (Beijing)', lat: 39.9042, lng: 116.4074, zoom: 11, popDensity: 6500 },
    { id: 'shanghai', name: '上海 (Shanghai)', lat: 31.2304, lng: 121.4737, zoom: 11, popDensity: 8200 },
    { id: 'tokyo', name: '东京 (Tokyo)', lat: 35.6895, lng: 139.6917, zoom: 11, popDensity: 9500 },
    { id: 'newyork', name: '纽约 (New York)', lat: 40.7517, lng: -73.9942, zoom: 11, popDensity: 10500 },
    { id: 'sf', name: '旧金山 (San Francisco)', lat: 37.7775, lng: -122.4111, zoom: 12, popDensity: 7200 },
    { id: 'london', name: '伦敦 (London)', lat: 51.5074, lng: -0.1278, zoom: 11, popDensity: 5700 }
  ];

  // Keyless ArcGIS MapServer raster tile layers (note {z}/{y}/{x} order)
  const BASEMAPS = {
    dark: {
      name: '暗色战术底图',
      url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      refUrl: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; World Dark Gray Canvas'
    },
    satellite: {
      name: '卫星影像',
      url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      refUrl: null,
      attribution: 'Tiles &copy; Esri &mdash; World Imagery'
    },
    street: {
      name: '标准街道',
      url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      refUrl: null,
      attribution: 'Tiles &copy; Esri &mdash; World Street Map'
    },
    grid: {
      name: '离线雷达网格',
      url: null,
      refUrl: null,
      attribution: 'NukeSim Offline Tactical Grid'
    }
  };

  return {
    WEAPON_PRESETS,
    CITY_PRESETS,
    BASEMAPS
  };
});
