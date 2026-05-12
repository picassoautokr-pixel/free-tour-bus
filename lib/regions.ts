export const SERVICE_REGIONS = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

export type ServiceRegion = (typeof SERVICE_REGIONS)[number];

const REGION_ALIASES: Array<[ServiceRegion, RegExp]> = [
  ["서울", /서울|서울시|서울특별시/],
  ["경기", /경기|경기도|수원|성남|고양|용인|부천|안산|안양|남양주|화성|평택|의정부|파주|김포|광명|경기광주|광주시|군포|하남|오산|이천|안성|구리|의왕|양평|여주|동두천|과천|가평|연천/],
  ["인천", /인천|인천시|인천광역시/],
  ["부산", /부산|부산시|부산광역시/],
  ["대구", /대구|대구시|대구광역시/],
  ["광주", /광주|광주시|광주광역시/],
  ["대전", /대전|대전시|대전광역시/],
  ["울산", /울산|울산시|울산광역시/],
  ["세종", /세종|세종시|세종특별자치시/],
  ["강원", /강원|강원도|강원특별자치도|춘천|원주|강릉|동해|속초|삼척|홍천|횡성|평창|정선|철원|화천|양구|인제|고성|양양/],
  ["충북", /충북|충청북도|청주|충주|제천|보은|옥천|영동|증평|진천|괴산|음성|단양/],
  ["충남", /충남|충청남도|천안|공주|보령|아산|서산|논산|계룡|당진|금산|부여|서천|청양|홍성|예산|태안/],
  ["전북", /전북|전라북도|전북특별자치도|전주|군산|익산|정읍|남원|김제|완주|진안|무주|장수|임실|순창|고창|부안/],
  ["전남", /전남|전라남도|목포|여수|순천|나주|광양|담양|곡성|구례|고흥|보성|화순|장흥|강진|해남|영암|무안|함평|영광|장성|완도|진도|신안/],
  ["경북", /경북|경상북도|포항|경주|김천|안동|구미|영주|영천|상주|문경|경산|군위|의성|청송|영양|영덕|청도|고령|성주|칠곡|예천|봉화|울진|울릉/],
  ["경남", /경남|경상남도|창원|진주|통영|사천|김해|밀양|거제|양산|의령|함안|창녕|고성|남해|하동|산청|함양|거창|합천/],
  ["제주", /제주|제주도|제주특별자치도|서귀포/],
];

const PLACE_OVERRIDES: Array<[ServiceRegion, RegExp]> = [
  ["서울", /영등포역|영등포|강남역|서울역|잠실|홍대|사당|신촌|고속터미널|김포공항|국립중앙박물관/],
  ["인천", /인천공항|송도/],
  ["경기", /수원|용인|에버랜드|킨텍스|kintex|일산|판교|분당/i],
  ["부산", /해운대|부산역|광안리|서면/],
];

const NOISE_WORDS = [
  "인근지역",
  "근처에서",
  "앞에서",
  "근처",
  "앞",
  "건너편",
  "맞은편",
  "주변",
  "인근",
  "입구",
  "정문",
  "후문",
  "부근",
  "근방",
];

export function normalizeRegion(value: unknown): ServiceRegion | "" {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return SERVICE_REGIONS.includes(trimmed as ServiceRegion)
    ? (trimmed as ServiceRegion)
    : "";
}

export function normalizeServiceRegions(value: unknown): ServiceRegion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ServiceRegion>();
  for (const item of value) {
    const region = normalizeRegion(item);
    if (region) seen.add(region);
  }
  return SERVICE_REGIONS.filter((region) => seen.has(region));
}

export function normalizeDepartureText(value: string): string {
  let text = value.trim();
  for (const word of [...NOISE_WORDS].sort((a, b) => b.length - a.length)) {
    text = text.replaceAll(word, " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

export function inferDepartureRegion(value: string): ServiceRegion | "" {
  const text = normalizeDepartureText(value);
  if (text === "") return "";

  for (const [region, pattern] of PLACE_OVERRIDES) {
    if (pattern.test(text)) return region;
  }
  for (const [region, pattern] of REGION_ALIASES) {
    if (pattern.test(text)) return region;
  }
  return "";
}
