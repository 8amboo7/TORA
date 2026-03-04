const PROVIDERS = ["aws", "azure", "huawei"];
const NATIONAL_INTENT_REGEX =
  /(ทั้งประเทศ|ทั่วประเทศ|ทั่วไทย|ระดับประเทศ|nationwide|national|country-?wide|all\s+thai(?:land)?\s+users|รองรับ.*ทั้งประเทศ|ประชาชนทั้งประเทศ|คนไทยทั้งประเทศ)/i;
const SMALLTALK_REGEX =
  /^(?:hi|hello|hey|yo|ok|okay|test|สวัสดี(?:ครับ|ค่ะ|คะ)?|หวัดดี(?:ครับ|ค่ะ|คะ)?|ฮัลโหล|ทำไรอยู่|ทำอะไรอยู่|สบายดี(?:ไหม|มั้ย)?|ขอบคุณ(?:ครับ|ค่ะ)?|ลองเฉยๆ|ทดสอบ)\s*[!.?,\u0E2F\u0E46\u0E5A\u0E5B]*$/i;
const REQUIREMENT_SIGNAL_REGEX =
  /(server|vm|instance|compute|cpu|ram|memory|storage|database|db|rds|mysql|postgres|network|vpc|cdn|waf|load balancer|autoscaling|active\/standby|read replica|user|concurrent|rps|traffic|web|mobile|api|erp|portal|cloud|budget|เซิร์ฟเวอร์|สเปก|ซีพียู|แรม|หน่วยความจำ|ดิสก์|พื้นที่จัดเก็บ|ฐานข้อมูล|เครือข่าย|ผู้ใช้|ทราฟฟิก|โหลดบาลานเซอร์|แอป|เว็บ|เว็ป|สำรอง|งบ|งบประมาณ|บาท|active standby|replica|ทั้งประเทศ|ทั่วไทย|ระดับประเทศ)/i;
const WEB_WORKLOAD_REGEX =
  /(web|website|landing|portal|wordpress|cms|หน้าเว็บ|เว็บ|เว็ป|เว็บแอป|เว็บไซต์)/i;
const BUDGET_CUE_REGEX =
  /(งบ|งบประมาณ|budget|บาท|baht|thb)/i;
const STATIC_WEB_BUDGET_THRESHOLD = 2500;

const CATEGORY = {
  compute: "Compute",
  storage: "Storage",
  database: "Database",
  network: "Network",
  security: "Security",
  management: "Management",
};

const BUDGET_STARTER_TEMPLATES = {
  staticWeb: {
    aws: [
      {
        category: CATEGORY.storage,
        service: "Amazon S3",
        spec: "Static website hosting (50GB storage + basic requests)",
        unit: "Package/Month",
        qty: 1,
        price: 280,
      },
      {
        category: CATEGORY.network,
        service: "Amazon CloudFront",
        spec: "CDN + transfer for low traffic website",
        unit: "Package/Month",
        qty: 1,
        price: 420,
      },
      {
        category: CATEGORY.network,
        service: "Amazon Route 53",
        spec: "Public DNS hosted zone",
        unit: "Zone/Month",
        qty: 1,
        price: 90,
      },
      {
        category: CATEGORY.security,
        service: "AWS WAF",
        spec: "Basic managed rule set",
        unit: "Policy/Month",
        qty: 1,
        price: 220,
      },
    ],
    azure: [
      {
        category: CATEGORY.storage,
        service: "Azure Blob Storage",
        spec: "Static website hosting (50GB storage + basic requests)",
        unit: "Package/Month",
        qty: 1,
        price: 300,
      },
      {
        category: CATEGORY.network,
        service: "Azure Front Door",
        spec: "CDN + transfer for low traffic website",
        unit: "Package/Month",
        qty: 1,
        price: 430,
      },
      {
        category: CATEGORY.network,
        service: "Azure DNS",
        spec: "Public DNS zone",
        unit: "Zone/Month",
        qty: 1,
        price: 95,
      },
      {
        category: CATEGORY.security,
        service: "Azure WAF",
        spec: "Basic managed rule set",
        unit: "Policy/Month",
        qty: 1,
        price: 230,
      },
    ],
    huawei: [
      {
        category: CATEGORY.storage,
        service: "Huawei OBS",
        spec: "Static website hosting (50GB storage + basic requests)",
        unit: "Package/Month",
        qty: 1,
        price: 250,
      },
      {
        category: CATEGORY.network,
        service: "Huawei CDN",
        spec: "CDN + transfer for low traffic website",
        unit: "Package/Month",
        qty: 1,
        price: 360,
      },
      {
        category: CATEGORY.network,
        service: "Huawei DNS",
        spec: "Public DNS zone",
        unit: "Zone/Month",
        qty: 1,
        price: 80,
      },
      {
        category: CATEGORY.security,
        service: "Huawei Cloud WAF",
        spec: "Basic managed rule set",
        unit: "Policy/Month",
        qty: 1,
        price: 190,
      },
    ],
  },
  vmWeb: {
    aws: [
      {
        category: CATEGORY.compute,
        service: "Amazon EC2",
        spec: "t4g.small (2 vCPU, 2GB RAM) - Linux",
        unit: "Instance/Month",
        qty: 1,
        price: 1050,
      },
      {
        category: CATEGORY.storage,
        service: "Amazon EBS",
        spec: "gp3 SSD 120GB",
        unit: "Volume/Month",
        qty: 1,
        price: 340,
      },
      {
        category: CATEGORY.network,
        service: "Amazon CloudFront",
        spec: "CDN + transfer for small web app",
        unit: "Package/Month",
        qty: 1,
        price: 620,
      },
      {
        category: CATEGORY.security,
        service: "AWS WAF",
        spec: "Basic managed rule set",
        unit: "Policy/Month",
        qty: 1,
        price: 260,
      },
      {
        category: CATEGORY.management,
        service: "Amazon CloudWatch",
        spec: "Basic logs and monitoring",
        unit: "Workspace/Month",
        qty: 1,
        price: 180,
      },
    ],
    azure: [
      {
        category: CATEGORY.compute,
        service: "Azure Virtual Machines",
        spec: "B2s (2 vCPU, 4GB RAM) - Linux",
        unit: "Instance/Month",
        qty: 1,
        price: 1120,
      },
      {
        category: CATEGORY.storage,
        service: "Azure Managed Disks",
        spec: "Premium SSD 128GB",
        unit: "Disk/Month",
        qty: 1,
        price: 360,
      },
      {
        category: CATEGORY.network,
        service: "Azure Front Door",
        spec: "CDN + transfer for small web app",
        unit: "Package/Month",
        qty: 1,
        price: 650,
      },
      {
        category: CATEGORY.security,
        service: "Azure WAF",
        spec: "Basic managed rule set",
        unit: "Policy/Month",
        qty: 1,
        price: 280,
      },
      {
        category: CATEGORY.management,
        service: "Azure Monitor",
        spec: "Basic logs and monitoring",
        unit: "Workspace/Month",
        qty: 1,
        price: 190,
      },
    ],
    huawei: [
      {
        category: CATEGORY.compute,
        service: "Huawei ECS",
        spec: "s6.small.2 (2 vCPU, 4GB RAM) - Linux",
        unit: "Instance/Month",
        qty: 1,
        price: 960,
      },
      {
        category: CATEGORY.storage,
        service: "Huawei EVS",
        spec: "SSD 120GB",
        unit: "Volume/Month",
        qty: 1,
        price: 320,
      },
      {
        category: CATEGORY.network,
        service: "Huawei CDN",
        spec: "CDN + transfer for small web app",
        unit: "Package/Month",
        qty: 1,
        price: 560,
      },
      {
        category: CATEGORY.security,
        service: "Huawei Cloud WAF",
        spec: "Basic managed rule set",
        unit: "Policy/Month",
        qty: 1,
        price: 230,
      },
      {
        category: CATEGORY.management,
        service: "Huawei Cloud Eye",
        spec: "Basic logs and monitoring",
        unit: "Workspace/Month",
        qty: 1,
        price: 170,
      },
    ],
  },
};

const BUDGET_STARTER_POLICY = {
  staticWeb: { minTotal: 650, multipliers: { aws: 1.0, azure: 1.06, huawei: 0.9 } },
  vmWeb: { minTotal: 2200, multipliers: { aws: 1.15, azure: 1.25, huawei: 1.05 } },
};

const BASELINE_MIN_TOTAL = 160000;

const BASELINE = {
  aws: {
    compute: { service: "Amazon EC2", spec: "m7i.2xlarge (8 vCPU, 32GB RAM) - Linux, Auto Scaling Multi-AZ", unit: "Instance/Month", qty: 12, price: 8500 },
    storage: { service: "Amazon EBS", spec: "gp3 SSD - Production", unit: "GB/Month", qty: 2000, price: 3.2 },
    database: { service: "Amazon RDS for MySQL", spec: "8 vCPU, 32GB RAM, Active/Standby + Read Replica", unit: "DB Instance/Month", qty: 2, price: 18000 },
    loadBalancer: { service: "Application Load Balancer", spec: "Regional Entry - Multi-AZ", unit: "LB/Month", qty: 1, price: 3500 },
    cdn: { service: "Amazon CloudFront", spec: "Nationwide Web Delivery", unit: "GB/Month", qty: 20000, price: 0.45 },
    security: { service: "AWS WAF", spec: "Managed Rules + Rate Limit", unit: "ACL/Month", qty: 1, price: 3000 },
    management: { service: "Amazon CloudWatch", spec: "Centralized Monitoring & Logs", unit: "Account/Month", qty: 1, price: 2500 },
  },
  azure: {
    compute: { service: "Azure Virtual Machines", spec: "D8s v5 (8 vCPU, 32GB RAM) - Linux, Auto Scaling Multi-AZ", unit: "Instance/Month", qty: 12, price: 8200 },
    storage: { service: "Azure Managed Disks", spec: "Premium SSD v2 - Production", unit: "GB/Month", qty: 2000, price: 3.1 },
    database: { service: "Azure Database for MySQL", spec: "8 vCPU, 32GB RAM, Zone Redundant + Read Replica", unit: "DB Instance/Month", qty: 2, price: 17500 },
    loadBalancer: { service: "Azure Application Gateway", spec: "Regional Entry - Multi-AZ", unit: "Gateway/Month", qty: 1, price: 3600 },
    cdn: { service: "Azure Front Door", spec: "Nationwide Web Delivery", unit: "GB/Month", qty: 20000, price: 0.48 },
    security: { service: "Azure WAF", spec: "Managed Rules + Rate Limit", unit: "Policy/Month", qty: 1, price: 3000 },
    management: { service: "Azure Monitor", spec: "Centralized Monitoring & Logs", unit: "Workspace/Month", qty: 1, price: 2500 },
  },
  huawei: {
    compute: { service: "Huawei ECS", spec: "c7.2xlarge (8 vCPU, 32GB RAM) - Linux, Auto Scaling Multi-AZ", unit: "Instance/Month", qty: 12, price: 7800 },
    storage: { service: "Huawei EVS", spec: "SSD - Production", unit: "GB/Month", qty: 2000, price: 3.0 },
    database: { service: "Huawei RDS for MySQL", spec: "8 vCPU, 32GB RAM, Active/Standby + Read Replica", unit: "DB Instance/Month", qty: 2, price: 17000 },
    loadBalancer: { service: "Huawei ELB", spec: "Regional Entry - Multi-AZ", unit: "ELB/Month", qty: 1, price: 3200 },
    cdn: { service: "Huawei CDN", spec: "Nationwide Web Delivery", unit: "GB/Month", qty: 20000, price: 0.42 },
    security: { service: "Huawei Cloud WAF", spec: "Managed Rules + Rate Limit", unit: "Policy/Month", qty: 1, price: 2900 },
    management: { service: "Huawei Cloud Eye", spec: "Centralized Monitoring & Logs", unit: "Workspace/Month", qty: 1, price: 2300 },
  },
};

const SERVICE_KEYWORDS = {
  loadBalancer: /(load balancer|application gateway|alb|elb|gateway)/i,
  cdn: /(cdn|front door|cloudfront|content delivery)/i,
  waf: /(waf|web application firewall)/i,
  monitor: /(monitor|cloudwatch|cloud eye|log|observability)/i,
  activeStandby: /(active\/standby|active-standby|multi-az|zone redundant|read replica)/i,
};

const extractSpecNumber = (spec, pattern) => {
  const match = String(spec || "").toLowerCase().match(pattern);
  if (!match) return null;
  const raw = match.slice(1).find(Boolean);
  return toNumber(raw, null);
};

const isTooSmallForNational = (spec, minVcpu, minRamGb) => {
  const text = String(spec || "");
  const vcpu = extractSpecNumber(text, /(\d+(?:\.\d+)?)\s*v\s*cpu|(\d+(?:\.\d+)?)\s*vcpu/);
  const ram = extractSpecNumber(text, /(\d+(?:\.\d+)?)\s*gb\s*ram|(\d+(?:\.\d+)?)\s*gb/);
  const normalizedVcpu =
    vcpu !== null ? vcpu : extractSpecNumber(text, /(\d+(?:\.\d+)?)\s*core/);

  if (normalizedVcpu !== null && normalizedVcpu < minVcpu) return true;
  if (ram !== null && ram < minRamGb) return true;
  return false;
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const sumTotal = (items = []) =>
  items.reduce((sum, item) => sum + round2(item.total || toNumber(item.price, 0) * toNumber(item.qty, 0)), 0);

const collectServiceText = (item) => `${item?.service || ""} ${item?.spec || ""}`.toLowerCase();

const asItem = (item, fallbackCategory) => ({
  id: toNumber(item?.id, 0),
  category: item?.category || fallbackCategory,
  service: item?.service || "",
  spec: item?.spec || "",
  unit: item?.unit || "",
  qty: toNumber(item?.qty, 0),
  price: round2(item?.price),
  total: round2(item?.total),
});

const recalc = (item) => {
  item.qty = Math.max(1, toNumber(item.qty, 1));
  item.price = Math.max(0, round2(item.price));
  item.total = round2(item.qty * item.price);
};

const parseBudgetNumber = (raw) => {
  const value = String(raw || "")
    .toLowerCase()
    .replace(/[, ]+/g, "")
    .trim();
  if (!value) return null;

  const scaled = value.match(/^(\d+(?:\.\d+)?)(k|m)$/i);
  if (scaled) {
    const amount = toNumber(scaled[1], 0);
    const multiplier = scaled[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
    return amount > 0 ? amount * multiplier : null;
  }

  const amount = toNumber(value, null);
  return amount && amount > 0 ? amount : null;
};

const extractBudgetThb = (text = "") => {
  const normalized = String(text || "").trim();
  if (!normalized || !BUDGET_CUE_REGEX.test(normalized)) return null;

  const patterns = [
    /(งบ(?:ประมาณ)?|budget)\s*(?:ไม่เกิน|ประมาณ|ราวๆ|around|about|<=|<|=)?\s*([\d.,]+\s*[kKmM]?)/i,
    /([\d.,]+\s*[kKmM]?)\s*(?:บาท|baht|thb)/i,
    /budget\s*([\d.,]+\s*[kKmM]?)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const rawBudget = match
      .slice(1)
      .find((part) => typeof part === "string" && /\d/.test(part));
    const parsed = parseBudgetNumber(rawBudget);
    if (parsed) return parsed;
  }

  return null;
};

const scaleStarterItems = (templateItems = [], targetTotal = 0) => {
  const base = templateItems.map((item) => ({
    id: 0,
    category: item.category,
    service: item.service,
    spec: item.spec,
    unit: item.unit,
    qty: Math.max(1, toNumber(item.qty, 1)),
    price: round2(item.price),
    total: 0,
  }));

  base.forEach(recalc);
  const baseTotal = sumTotal(base);
  const scale = baseTotal > 0 ? Math.min(1.8, Math.max(0.55, targetTotal / baseTotal)) : 1;

  base.forEach((item, idx) => {
    item.price = round2(item.price * scale);
    item.id = idx + 1;
    recalc(item);
  });

  return base;
};

const detectStarterProfile = (text = "", budget = 0) => {
  if (!WEB_WORKLOAD_REGEX.test(text)) {
    return budget <= STATIC_WEB_BUDGET_THRESHOLD ? "staticWeb" : "vmWeb";
  }
  return budget <= STATIC_WEB_BUDGET_THRESHOLD ? "staticWeb" : "vmWeb";
};

const upsertByCategory = (items, category, baseline) => {
  let target = items.find((item) => String(item.category || "").toLowerCase() === category.toLowerCase());
  if (!target) {
    target = asItem(
      {
        category,
        service: baseline.service,
        spec: baseline.spec,
        unit: baseline.unit,
        qty: baseline.qty,
        price: baseline.price,
      },
      category,
    );
    recalc(target);
    items.push(target);
    return target;
  }

  target.category = category;
  target.service = target.service || baseline.service;
  target.spec = target.spec || baseline.spec;
  if (category === CATEGORY.compute && isTooSmallForNational(target.spec, 8, 16)) {
    target.spec = baseline.spec;
  }
  if (category === CATEGORY.database && isTooSmallForNational(target.spec, 8, 16)) {
    target.spec = baseline.spec;
  }
  target.unit = target.unit || baseline.unit;
  target.qty = Math.max(toNumber(target.qty, 0), baseline.qty);
  target.price = Math.max(toNumber(target.price, 0), baseline.price);
  recalc(target);
  return target;
};

const upsertByKeyword = (items, category, keyword, baseline) => {
  let target = items.find((item) => {
    if (String(item.category || "").toLowerCase() !== category.toLowerCase()) return false;
    return keyword.test(collectServiceText(item));
  });

  if (!target) {
    target = asItem(
      {
        category,
        service: baseline.service,
        spec: baseline.spec,
        unit: baseline.unit,
        qty: baseline.qty,
        price: baseline.price,
      },
      category,
    );
    recalc(target);
    items.push(target);
    return target;
  }

  target.category = category;
  target.service = target.service || baseline.service;
  target.spec = target.spec || baseline.spec;
  target.unit = target.unit || baseline.unit;
  target.qty = Math.max(toNumber(target.qty, 0), baseline.qty);
  target.price = Math.max(toNumber(target.price, 0), baseline.price);
  recalc(target);
  return target;
};

const normalizeProviderItems = (provider, sourceItems = []) => {
  const baseline = BASELINE[provider];
  const items = sourceItems.map((item) => asItem(item, CATEGORY.compute));

  const compute = upsertByCategory(items, CATEGORY.compute, baseline.compute);
  const storage = upsertByCategory(items, CATEGORY.storage, baseline.storage);
  const database = upsertByCategory(items, CATEGORY.database, baseline.database);

  if (!SERVICE_KEYWORDS.activeStandby.test(collectServiceText(database))) {
    database.spec = `${database.spec}; Active/Standby + Read Replica`;
    recalc(database);
  }

  upsertByKeyword(items, CATEGORY.network, SERVICE_KEYWORDS.loadBalancer, baseline.loadBalancer);
  upsertByKeyword(items, CATEGORY.network, SERVICE_KEYWORDS.cdn, baseline.cdn);
  upsertByKeyword(items, CATEGORY.security, SERVICE_KEYWORDS.waf, baseline.security);
  upsertByKeyword(items, CATEGORY.management, SERVICE_KEYWORDS.monitor, baseline.management);

  recalc(compute);
  recalc(storage);
  recalc(database);

  const total = sumTotal(items);
  if (total < BASELINE_MIN_TOTAL) {
    const extraPerUnit = round2((BASELINE_MIN_TOTAL - total) / Math.max(1, compute.qty));
    compute.price = round2(compute.price + extraPerUnit);
    recalc(compute);
  }

  items.forEach((item, idx) => {
    item.id = idx + 1;
    recalc(item);
  });

  return items;
};

export const isNationalScaleRequest = (text = "") => NATIONAL_INTENT_REGEX.test(String(text));
export const isSmallTalkMessage = (text = "") =>
  SMALLTALK_REGEX.test(String(text || "").trim());

export const collectUserMessagesText = (messages = []) =>
  messages
    .filter((msg) => msg?.role === "user")
    .map((msg) => String(msg?.content || ""))
    .join("\n");

export const getLastUserMessageText = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return String(messages[i]?.content || "");
    }
  }
  return "";
};

export const hasBomItems = (bom) =>
  PROVIDERS.some((provider) => Array.isArray(bom?.[provider]) && bom[provider].length > 0);

export const shouldLockBomForChat = (messages = [], bom = null) => {
  const latest = getLastUserMessageText(messages).trim();
  if (!latest) return true;
  if (isSmallTalkMessage(latest)) return true;

  const hasSignal = REQUIREMENT_SIGNAL_REGEX.test(latest);
  const hasNumber = /\d/.test(latest);
  const hasAction = /(เพิ่ม|ลด|ปรับ|เปลี่ยน|ออกแบบ|คำนวณ|ประเมิน|ขอ|ช่วย|ต้องการ|อยาก|refine|adjust|change|estimate|size|design|bom)/i.test(
    latest,
  );

  if (hasSignal || hasNumber) return false;
  if (hasAction && latest.length >= 24) return false;

  if (!hasBomItems(bom) && latest.length >= 48) return false;
  return true;
};

export const needsRequirementClarification = ({ messages = [], bom = null }) => {
  if (hasBomItems(bom)) return false;

  const latest = getLastUserMessageText(messages).trim();
  if (!latest) return true;
  if (SMALLTALK_REGEX.test(latest)) return true;

  const hasSignal = REQUIREMENT_SIGNAL_REGEX.test(latest);
  const hasNumber = /\d/.test(latest);
  const tokenCount = latest.split(/\s+/).filter(Boolean).length;

  if (!hasSignal && !hasNumber && tokenCount <= 4) return true;
  if (!hasSignal && !hasNumber && latest.length < 24) return true;
  return false;
};

export const buildBudgetStarterBom = ({ messages = [], bom = null }) => {
  if (hasBomItems(bom)) return null;

  const latest = getLastUserMessageText(messages).trim();
  if (!latest) return null;

  const budgetThb = extractBudgetThb(latest);
  if (!budgetThb) return null;

  const profile = detectStarterProfile(latest, budgetThb);
  const templateByProvider = BUDGET_STARTER_TEMPLATES[profile];
  const policy = BUDGET_STARTER_POLICY[profile];
  if (!templateByProvider || !policy) return null;

  const nextBom = {};
  for (const provider of PROVIDERS) {
    const template = templateByProvider[provider];
    if (!Array.isArray(template) || template.length === 0) {
      nextBom[provider] = [];
      continue;
    }
    const multiplier = toNumber(policy.multipliers?.[provider], 1);
    const targetTotal = Math.max(policy.minTotal || 0, round2(budgetThb * multiplier));
    nextBom[provider] = scaleStarterItems(template, targetTotal);
  }

  return {
    budgetThb: round2(budgetThb),
    profile,
    bom: nextBom,
  };
};

export const applySizingPolicy = ({ bom, summary = "", contextText = "" }) => {
  if (!bom || typeof bom !== "object") {
    return { bom, summary, policyApplied: false };
  }
  if (!isNationalScaleRequest(contextText)) {
    return { bom, summary, policyApplied: false };
  }

  const nextBom = {};
  for (const provider of PROVIDERS) {
    const sourceItems = Array.isArray(bom[provider]) ? bom[provider] : [];
    nextBom[provider] = normalizeProviderItems(provider, sourceItems);
  }

  const note =
    "หมายเหตุ: ระบบปรับ baseline ระดับประเทศ (Multi-AZ, Auto Scaling, DB Active/Standby + Read Replica, CDN และ WAF) เพื่อหลีกเลี่ยงการประเมินทรัพยากรต่ำเกินจริง";
  const nextSummary = String(summary || "").includes("baseline ระดับประเทศ")
    ? summary
    : [summary, note].filter(Boolean).join(" ");

  return { bom: nextBom, summary: nextSummary, policyApplied: true };
};
