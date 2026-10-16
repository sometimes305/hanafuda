(function () {
  // Card paths must follow this script's origin, not the embedding document.
  // Gravity serves its own HTML from cdn.gravity.place while loading this file
  // from GitHub Pages, so document-relative image URLs otherwise point at a 404.
  const scriptUrl = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : window.location.href;
  const cardAssetBaseUrl = new URL("./assets/cards/", scriptUrl);

  const months = [
    { name: "松", color: "pine", cards: [["crane", "bright", "鶴"], ["poetry", "ribbon", "あ"], ["plain", "chaff", "松"], ["plain", "chaff", "松"]] },
    { name: "梅", color: "plum", cards: [["warbler", "animal", "鶯"], ["poetry", "ribbon", "あ"], ["plain", "chaff", "梅"], ["plain", "chaff", "梅"]] },
    { name: "桜", color: "cherry", cards: [["curtain", "bright", "幕"], ["poetry", "ribbon", "あ"], ["plain", "chaff", "桜"], ["plain", "chaff", "桜"]] },
    { name: "藤", color: "wisteria", cards: [["cuckoo", "animal", "郭"], ["red", "ribbon", "短"], ["plain", "chaff", "藤"], ["plain", "chaff", "藤"]] },
    { name: "菖蒲", color: "iris", cards: [["bridge", "animal", "橋"], ["red", "ribbon", "短"], ["plain", "chaff", "菖"], ["plain", "chaff", "菖"]] },
    { name: "牡丹", color: "peony", cards: [["butterfly", "animal", "蝶"], ["blue", "ribbon", "青"], ["plain", "chaff", "牡"], ["plain", "chaff", "牡"]] },
    { name: "萩", color: "clover", cards: [["boar", "animal", "猪"], ["red", "ribbon", "短"], ["plain", "chaff", "萩"], ["plain", "chaff", "萩"]] },
    { name: "芒", color: "pampas", cards: [["moon", "bright", "月"], ["geese", "animal", "雁"], ["plain", "chaff", "芒"], ["plain", "chaff", "芒"]] },
    { name: "菊", color: "chrysanthemum", cards: [["sake", "animal", "盃"], ["blue", "ribbon", "青"], ["plain", "chaff", "菊"], ["plain", "chaff", "菊"]] },
    { name: "紅葉", color: "maple", cards: [["deer", "animal", "鹿"], ["blue", "ribbon", "青"], ["plain", "chaff", "楓"], ["plain", "chaff", "楓"]] },
    { name: "柳", color: "willow", cards: [["rain", "bright", "雨"], ["swallow", "animal", "燕"], ["red", "ribbon", "短"], ["lightning", "chaff", "雷"]] },
    { name: "桐", color: "paulownia", cards: [["phoenix", "bright", "鳳"], ["plain", "chaff", "桐"], ["plain", "chaff", "桐"], ["plain", "chaff", "桐"]] }
  ];

  const cards = [];
  months.forEach((month, monthIndex) => {
    month.cards.forEach(([key, type, glyph], cardIndex) => cards.push({
      id: `${monthIndex + 1}-${cardIndex + 1}`,
      asset: new URL(`${monthIndex * 4 + cardIndex}.png`, cardAssetBaseUrl).href,
      month: monthIndex + 1,
      monthName: month.name,
      palette: month.color,
      key,
      type,
      glyph
    }));
  });

  window.HanafudaCards = { cards, months };
})();
