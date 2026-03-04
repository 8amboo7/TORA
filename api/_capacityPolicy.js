const PROVIDERS = ["aws", "azure", "huawei"];
const NATIONAL_INTENT_REGEX =
  /(ทั้งประเทศ|ทั่วประเทศ|ทั่วไทย|ระดับประเทศ|nationwide|national|country-?wide|all\s+thai(?:land)?\s+users|รองรับ.*ทั้งประเทศ|ประชาชนทั้งประเทศ|คนไทยทั้งประเทศ)/i;
const SMALLTALK_REGEX =
  /^(?:hi|hello|hey|yo|ok|okay|test|สวัสดี(?:ครับ|ค่ะ|คะ)?|หวัดดี(?:ครับ|ค่ะ|คะ)?|ฮัลโหล|ทำไรอยู่|ทำอะไรอยู่|สบายดี(?:ไหม|มั้ย)?|ขอบคุณ(?:ครับ|ค่ะ)?|ลองเฉยๆ|ทดสอบ)\s*[!.?,\u0E2F\u0E46\u0E5A\u0E5B]*$/i;
const REQUIREMENT_SIGNAL_REGEX =
  /(server|vm|instance|compute|cpu|ram|memory|storage|database|db|rds|mysql|postgres|network|vpc|cdn|waf|load balancer|autoscaling|active\/standby|read replica|user|concurrent|rps|traffic|web|mobile|api|erp|portal|cloud|เซิร์ฟเวอร์|สเปก|ซีพียู|แรม|หน่วยความจำ|ดิสก์|พื้นที่จัดเก็บ|ฐานข้อมูล|เครือข่าย|ผู้ใช้|ทราฟฟิก|โหลดบาลานเซอร์|แอป|เว็บ|สำรอง|active standby|replica|ทั้งประเทศ|ทั่วไทย|ระดับประเทศ)/i;

const CATEGORY = {
  compute: "Compute",
  storage: "Storage",
  database: "Database",
  network: "Network",
  security: "Security",
  management: "Management",
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
