import { Knex, toDbTime } from "../index";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../../config";

const C = crypto.randomBytes;
function key(): string {
  return C(8).toString("hex").toUpperCase().match(/.{4}/g)!.join("-");
}
function daysAgo(n: number): string {
  return toDbTime(new Date(Date.now() - n * 86400_000));
}

function svgCover(id: string, from: string, to: string, label: string): string {
  const dir = path.join(config.uploads.dir, "seed");
  fs.mkdirSync(dir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
<defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
<radialGradient id="r${id}" cx="0.8" cy="0.2" r="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
<rect width="800" height="500" fill="url(#g${id})"/><rect width="800" height="500" fill="url(#r${id})"/>
<circle cx="120" cy="420" r="140" fill="#ffffff" opacity="0.08"/><circle cx="700" cy="420" r="90" fill="#ffffff" opacity="0.1"/>
<text x="48" y="270" font-family="Segoe UI, Helvetica, Arial" font-size="56" font-weight="700" fill="#ffffff">${label}</text>
<text x="48" y="330" font-family="Segoe UI, Helvetica, Arial" font-size="26" fill="#eaffff" opacity="0.9">Digital Store</text>
</svg>`;
  fs.writeFileSync(path.join(dir, `cover-${id}.svg`), svg);
  return `/uploads/seed/cover-${id}.svg`;
}

export async function seed(knex: Knex): Promise<void> {
  // idempotent: skip if categories already seeded
  const c = await knex("categories").count({ n: "*" }).first();
  if (Number((c as any)?.n) > 0) {
    console.log("seed: data already present — skipping");
    return;
  }
  const now = toDbTime();

  // ---------------- categories ----------------
  const categories = [
    { nameKm: "កម្មវិធី Premium", nameEn: "App Premium / Pro", slug: "app-premium", icon: "Crown" },
    { nameKm: "កូនសោ Software", nameEn: "Software & License Keys", slug: "software-keys", icon: "KeyRound" },
    { nameKm: "សមាជិកភាព / Membership", nameEn: "Subscription & Membership", slug: "subscriptions", icon: "Repeat" },
    { nameKm: "បញ្ចូលហ្គេម", nameEn: "Game Top-Up", slug: "game-topup", icon: "Gamepad2" },
    { nameKm: "Gift Card & Voucher", nameEn: "Gift Cards & Vouchers", slug: "gift-cards", icon: "Gift" },
    { nameKm: "Template វេបសាយ", nameEn: "Website Templates & Files", slug: "templates", icon: "FileCode2" },
    { nameKm: "សៀវភៅអេឡិចត្រូនិក", nameEn: "E-books & Documents", slug: "ebooks", icon: "BookOpen" },
    { nameKm: "គណនីឌីជីថល", nameEn: "Digital Accounts", slug: "accounts", icon: "UserCircle" }
  ];
  const catIds: Record<string, number> = {};
  for (const [i, cat] of categories.entries()) {
    const res = await knex("categories").insert({
      name_km: cat.nameKm, name_en: cat.nameEn, slug: cat.slug, icon: cat.icon,
      sort_order: i, is_active: 1, created_at: now, updated_at: now
    });
    const row = await knex("categories").where({ slug: cat.slug }).first();
    catIds[cat.slug] = Number(row.id ?? (Array.isArray(res) ? res[0] : res));
  }

  // ---------------- banners ----------------
  await knex("banners").insert([
    { title: "ស្វាគមន៍មកកាន់ Digital Store", subtitle: "Premium digital products, instant delivery", image_url: svgCover("b1", "#087FA5", "#2BB3D9", "Premium Digital Store"), link_url: "/products", sort_order: 0, is_active: 1, created_at: now, updated_at: now },
    { title: "Promotion 20% លើ Game Top-Up", subtitle: "Use code GAME20 before it ends", image_url: svgCover("b2", "#163547", "#087FA5", "Game Top-Up Sale"), link_url: "/products?category=game-top", sort_order: 1, is_active: 1, created_at: now, updated_at: now }
  ]);

  // ---------------- products ----------------
  type P = {
    slug: string; name: string; cat: string; desc: string; price: number; cost: number;
    duration: string; delivery: "AUTO" | "MANUAL"; stockMode: string; featured?: boolean; offer?: boolean;
    keys?: number; variants?: Array<{ name: string; price: number; cost: number; duration: string; stock: number }>;
    instructions?: string; cover?: number;
  };
  const products: P[] = [
    { slug: "capcut-pro", name: "CapCut Pro (30 ថ្ងៃ)", cat: "app-premium", desc: "Premium video editing account with all Pro effects unlocked.", price: 250, cost: 150, duration: "30 days", delivery: "MANUAL", stockMode: "UNLIMITED", featured: true, variants: [] },
    { slug: "canva-pro", name: "Canva Pro Account (1 ខែ)", cat: "app-premium", desc: "Full Canva Pro access: brand kits, magic resize, premium stock.", price: 1.49e2, cost: 90, duration: "1 month", delivery: "MANUAL", stockMode: "INVENTORY", featured: true, variants: [{ name: "1 ម៉ាក (Standard)", price: 149, cost: 90, duration: "1 month", stock: -1 }, { name: "2 ម៉ាក (Family)", price: 249, cost: 160, duration: "1 month", stock: -1 }] },
    { slug: "netflix-premium", name: "Netflix Premium (Shared)", cat: "subscriptions", desc: "4K UHD shared profile, 30 days, email access included.", price: 3.9e2, cost: 260, duration: "30 days", delivery: "MANUAL", stockMode: "INVENTORY", featured: true, offer: true, variants: [{ name: "1 ខែ", price: 390, cost: 260, duration: "30 days", stock: -1 }, { name: "3 ខែ", price: 1090, cost: 730, duration: "90 days", stock: -1 }] },
    { slug: "spotify-premium", name: "Spotify Premium (3 ខែ)", cat: "subscriptions", desc: "Private email login, full premium sound, offline downloads.", price: 2.7e2, cost: 180, duration: "3 months", delivery: "AUTO", stockMode: "INVENTORY", keys: 10, variants: [] },
    { slug: "windows-11-key", name: "Windows 11 Pro Key", cat: "software-keys", desc: "Genuine retail key, lifetime activation, install instructions included.", price: 1.1e2, cost: 60, duration: "Lifetime", delivery: "AUTO", stockMode: "KEY_POOL", featured: true, keys: 25, instructions: "1) Settings > Activation 2) Change product key 3) Paste your key. Internet connection required.", variants: [{ name: "1 Device", price: 110, cost: 60, duration: "Lifetime", stock: -1 }, { name: "3 Devices", price: 290, cost: 160, duration: "Lifetime", stock: -1 }] },
    { slug: "office-2021", name: "Office 2021 Pro Plus", cat: "software-keys", desc: "Word, Excel, PowerPoint + more, lifetime license.", price: 1.45e2, cost: 85, duration: "Lifetime", delivery: "AUTO", stockMode: "KEY_POOL", keys: 15, variants: [] },
    { slug: "free-fire-diamonds", name: "Free Fire Diamonds", cat: "game-topup", desc: "Instant diamond top-up to your game ID. Enter your Player ID at checkout.", price: 20, cost: 17, duration: "Instant", delivery: "AUTO", stockMode: "INVENTORY", offer: true, keys: 30, variants: [{ name: "110 Diamonds", price: 20, cost: 17, duration: "Instant", stock: -1 }, { name: "310 Diamonds", price: 55, cost: 47, duration: "Instant", stock: -1 }, { name: "520 Diamonds", price: 90, cost: 76, duration: "Instant", stock: -1 }] },
    { slug: "pubg-uc", name: "PUBG Mobile UC", cat: "game-topup", desc: "Unknown Cash recharge, delivered within minutes.", price: 22, cost: 19, duration: "Instant", delivery: "MANUAL", stockMode: "UNLIMITED", variants: [{ name: "60 UC", price: 22, cost: 19, duration: "Instant", stock: -1 }, { name: "325 UC", price: 105, cost: 92, duration: "Instant", stock: -1 }] },
    { slug: "steam-giftcard", name: "Steam Wallet Card $20", cat: "gift-cards", desc: "Digital wallet code for the US region.", price: 2075, cost: 1950, duration: "No expiry", delivery: "AUTO", stockMode: "KEY_POOL", keys: 12, offer: true, instructions: "Steam > Games > Redeem a Steam Gift Card or Wallet Code.", variants: [] },
    { slug: "googleplay-25", name: "Google Play Gift $25", cat: "gift-cards", desc: "Play Store credit code, instant email-free delivery in app.", price: 2580, cost: 2450, duration: "No expiry", delivery: "AUTO", stockMode: "KEY_POOL", keys: 8, variants: [] },
    { slug: "portfolio-template", name: "Portfolio Website Template", cat: "templates", desc: "Responsive HTML/Tailwind portfolio template with 4 pages.", price: 900, cost: 0, duration: "Lifetime files", delivery: "AUTO", stockMode: "INVENTORY", featured: true, keys: 6, variants: [] },
    { slug: "ecommerce-ui-kit", name: "E-commerce UI Kit (Figma)", cat: "templates", desc: "120+ screens Figma kit for online stores.", price: 1450, cost: 0, duration: "Lifetime files", delivery: "AUTO", stockMode: "INVENTORY", keys: 6, variants: [] },
    { slug: "ebook-ai", name: "E-book: AI Money Methods", cat: "ebooks", desc: "78-page PDF guide on earning with AI tools (Khmer + English).", price: 700, cost: 0, duration: "Lifetime", delivery: "AUTO", stockMode: "INVENTORY", keys: 9, variants: [] },
    { slug: "youtube-premium", name: "YouTube Premium (1 ខែ)", cat: "app-premium", desc: "Ad-free videos + Music, join with your own email.", price: 1.05e2, cost: 70, duration: "1 month", delivery: "MANUAL", stockMode: "UNLIMITED", offer: true, variants: [] },
    { slug: "chatgpt-plus", name: "ChatGPT Plus (1 ខែ)", cat: "app-premium", desc: "Shared or individual plans, GPT-4 access & more.", price: 1.69e2, cost: 120, duration: "1 month", delivery: "MANUAL", stockMode: "INVENTORY", featured: true, offer: true, variants: [{ name: "Family Share (4 seats)", price: 169, cost: 120, duration: "1 month", stock: -1 }, { name: "Private Individual", price: 199, cost: 145, duration: "1 month", stock: -1 }] }
  ];

  const prodIds: Record<string, number> = {};
  for (const [i, p] of products.entries()) {
    const code = `PRD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const cover = svgCover(`p${i}`, ["#087FA5", "#2BB3D9", "#163547", "#5BC8F5", "#0EA5A4", "#1273B5", "#2563EB", "#06B6D4", "#7C3AED", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#14B8A6", "#0891B2"][i % 15], "#0B5F7A", p.name.split("(")[0].trim());
    await knex("products").insert({
      code, category_id: catIds[p.cat], name: p.name, description: p.desc, instructions: p.instructions || "Contact support if you need help.",
      cover_url: cover, price_minor: p.price, cost_minor: p.cost, duration_label: p.duration,
      delivery_type: p.delivery, status: "ACTIVE", stock_mode: p.stockMode === "INVENTORY" ? "INVENTORY" : p.stockMode,
      is_featured: p.featured ? 1 : 0, is_offer: p.offer ? 1 : 0, sales_count: 4 + (i * 3) % 17, view_count: 120 + i * 37,
      sort_order: i, created_at: now, updated_at: now
    });
    const row = await knex("products").where({ code }).first();
    const pid = Number(row.id);
    prodIds[p.slug] = pid;
    for (const [vi, v] of (p.variants || []).entries()) {
      await knex("product_variants").insert({
        product_id: pid, name: v.name, duration_label: v.duration, price_minor: v.price, cost_minor: v.cost,
        compare_at_minor: Math.round(v.price * 1.25), stock: 0, sort_order: vi, is_active: 1, created_at: now, updated_at: now
      });
    }
    if (p.keys) {
      for (let s = 0; s < p.keys; s++) {
        const itemType = p.cat === "templates" || p.cat === "ebooks" ? "FILE" : p.delivery === "AUTO" && p.stockMode === "KEY_POOL" ? "KEY" : "KEY";
        await knex("digital_inventory").insert({
          product_id: pid, variant_id: null, item_type: itemType,
          value: itemType === "FILE" ? "seed/sample.txt" : key(),
          file_name: itemType === "FILE" ? `${p.slug}.txt` : null,
          status: "AVAILABLE", added_by: null, created_at: now
        });
      }
    }
  }

  // ---------------- payment providers ----------------
  await knex("payment_providers").insert([
    { code: "ABA_KHQR", name: "ABA Pay (KHQR)", mode: "MANUAL", account_name: "DIGITAL STORE CO., LTD", account_number: "023000168", qr_url: svgCover("q1", "#D6001C", "#087FA5", "KHQR"), instructions: "1) Open ABA Pay and scan the QR shown here.\n2) Enter the exact amount requested.\n3) Copy the ABA transaction ID and paste it into the Reference field.\n4) Wait for the admin to approve (usually under 10 minutes during working hours).", min_minor: 100, max_minor: 0, currency: "USD", sort_order: 0, is_active: 1, created_at: now, updated_at: now },
    { code: "ACLED_WING", name: "Wing Transfer", mode: "MANUAL", account_name: "Digital Store", account_number: "012 345 678", qr_url: null, instructions: "Send exact amount to the Wing number shown, then submit your Wing transaction reference.", min_minor: 2000, max_minor: 0, currency: "USD", sort_order: 1, is_active: 1, created_at: now, updated_at: now },
    { code: "BANK_TRANSFER", name: "Bank Transfer (ACLEDA)", mode: "MANUAL", account_name: "Digital Store Co.", account_number: "000139876", qr_url: null, instructions: "Transfer to the account below and include your Deposit Code in the payment note.", min_minor: 500, max_minor: 0, currency: "USD", sort_order: 2, is_active: 0, created_at: now, updated_at: now }
  ]);

  // ---------------- store settings ----------------
  await knex("store_settings").insert([
    { key: "store", value: JSON.stringify({ storeName: "Digital Store", websiteTitle: "Digital Store — Premium Digital Products", currency: "USD", timezone: "Asia/Phnom_Penh", telegramBotUsername: "@your_store_bot", supportUrl: "https://t.me/your_support", termsKm: "លក្ខខណ៌៖ ផលិតផលឌីជីថលទាំងអស់អាចប្តូរវិញបានលុះត្រាតែមានបញ្ហាបច្ចេកទេស។", termsEn: "All digital products are non-refundable except for verified technical delivery issues.", privacyKm: "យើងរក្សាទុកតែព័ត៌មាន Telegram ចាំបាច់។", privacyEn: "We store only the Telegram information required to deliver your orders.", maintenanceMode: false }), updated_by: null, updated_at: now },
    { key: "payments", value: JSON.stringify({ autoWebhookEnabled: false, depositExpiryHours: 24 }), updated_by: null, updated_at: now },
    { key: "delivery", value: JSON.stringify({ autoNotifyTelegram: true }), updated_by: null, updated_at: now }
  ]);

  // ---------------- promotions ----------------
  await knex("promotions").insert([
    { code: "GAME20", name: "Game Top-Up Day", kind: "PERCENT", value_minor: 2000, max_discount_minor: 1000, min_order_minor: 2000, usage_limit: 200, per_user_limit: 3, product_ids: JSON.stringify(Object.entries(prodIds).filter(([s]) => s.startsWith("free") || s.startsWith("pubg")).map(([, idNum]) => idNum)), starts_at: daysAgo(1), ends_at: toDbTime(new Date(Date.now() + 6 * 86400_000)), is_active: 1, created_by: null, created_at: now, updated_at: now },
    { code: "WELCOME2", name: "Welcome $2 Off", kind: "FIXED", value_minor: 200, max_discount_minor: 0, min_order_minor: 1000, usage_limit: 0, per_user_limit: 1, product_ids: null, starts_at: daysAgo(10), ends_at: toDbTime(new Date(Date.now() + 60 * 86400_000)), is_active: 1, created_by: null, created_at: now, updated_at: now }
  ]);

  // ---------------- demo users with history ----------------
  const mkUser = async (tgid: number, name: string, username: string): Promise<number> => {
    const res = await knex("users").insert({
      telegram_id: tgid, username, display_name: name, first_name: name.split(" ")[0], photo_url: null,
      language: "km", is_active: 1, notifications_enabled: 1, is_admin: 0, created_at: daysAgo(20), updated_at: now
    });
    const row = await knex("users").where({ telegram_id: tgid }).first();
    const uid = Number(row?.id ?? (Array.isArray(res) ? res[0] : res));
    await knex("wallets").insert({ user_id: uid, currency: "USD", balance_minor: 0, lifetime_topup_minor: 0, lifetime_spend_minor: 0, created_at: now, updated_at: now });
    return uid;
  };
  const u1 = await mkUser(11001, "Sok Dara", "sokdara");
  const u2 = await mkUser(11002, "Chandra Ni", "chandra_ni");
  const u3 = await mkUser(11003, "Vichea Huot", "vichea");
  const adminU = await mkUser(-900000001, "Store Admin", "store_admin");
  await knex("users").where({ id: adminU }).update({ is_admin: 1 });
  await knex("admin_users").insert({ user_id: adminU, role: "SUPER_ADMIN", permissions: null, is_active: 1, created_at: now, updated_at: now });

  const setBal = async (uid: number, bal: number, topup: number, spend: number) => {
    await knex("wallets").where({ user_id: uid }).update({ balance_minor: bal, lifetime_topup_minor: topup, lifetime_spend_minor: spend });
  };
  await setBal(u1, 4008, 5000, 992);
  await setBal(u2, 2610, 3000, 390);
  await setBal(u3, 1682, 2000, 318);

  // deposit requests + txns
  let bal = 5000;
  await knex("wallet_transactions").insert({ ref: "WLT-260101-AAA001", user_id: u1, type: "DEPOSIT", amount_minor: 5000, balance_before_minor: 0, balance_after_minor: 5000, order_id: null, deposit_id: 1, created_by: adminU, reason: "Top-up DEP-SEED-1 via ABA_KHQR", idempotency_key: "seed:dep1", created_at: daysAgo(12) });
  await knex("deposits").insert({ code: "DEP-SEED-1", user_id: u1, provider_id: 1, provider_code: "ABA_KHQR", amount_minor: 5000, currency: "USD", status: "APPROVED", txn_ref: "ABA44512001", proof_path: null, admin_note: "verified receipt", reviewed_by: adminU, reviewed_at: daysAgo(12), expires_at: daysAgo(11), wallet_txn_id: 1, created_at: daysAgo(12) });
  await knex("deposits").insert({ code: "DEP-SEED-P1", user_id: u2, provider_code: "ABA_KHQR", provider_id: 1, amount_minor: 3000, currency: "USD", status: "PENDING", txn_ref: "ABA44900871", proof_path: null, expires_at: toDbTime(new Date(Date.now() + 20 * 3600_000)), created_at: toDbTime(new Date(Date.now() - 3600_000)) });
  void bal;

  // orders: completed auto (with delivery + key claim), manual pending, failed+refund
  const mkOrder = async (opts: {
    uid: number; codePrefix: string; status: string; total: number; items: Array<{ pid: number; name: string; qty: number; price: number; deliveryType: string; delivered?: boolean }>;
    created: string; withTxn?: boolean; balanceAfter?: number;
  }) => {
    const ores = await knex("orders").insert({
      code: opts.codePrefix, user_id: opts.uid, status: opts.status, currency: "USD",
      items_total_minor: opts.items.reduce((a, it) => a + it.price * it.qty, 0), discount_minor: 0, total_minor: opts.total,
      payment_method: "WALLET", created_at: opts.created, updated_at: opts.created
    });
    const orow = await knex("orders").where({ code: opts.codePrefix }).first();
    const oid = Number(orow?.id ?? (Array.isArray(ores) ? ores[0] : ores));
    for (const it of opts.items) {
      const ires = await knex("order_items").insert({
        order_id: oid, product_id: it.pid, variant_id: null, product_name: it.name, variant_name: null,
        quantity: it.qty, unit_price_minor: it.price, unit_cost_minor: Math.round(it.price * 0.65),
        delivery_type: it.deliveryType, delivery_status: it.delivered ? "DELIVERED" : "PENDING",
        created_at: opts.created, updated_at: opts.created
      });
      const irow = await knex("order_items").where({ order_id: oid, product_name: it.name }).first();
      const itemId = Number(irow?.id ?? (Array.isArray(ires) ? ires[0] : ires));
      await knex("order_status_history").insert({ order_id: oid, from_status: null, to_status: "PENDING_PAYMENT", actor_role: "USER", created_at: opts.created });
      await knex("order_status_history").insert({ order_id: oid, from_status: "PENDING_PAYMENT", to_status: "PAID", actor_role: "USER", reason: "Wallet payment", created_at: opts.created });
      if (it.delivered) {
        const claimed = await knex("digital_inventory").where({ product_id: it.pid, status: "AVAILABLE" }).orderBy("id", "asc").first();
        if (claimed) await knex("digital_inventory").where({ id: claimed.id }).update({ status: "ASSIGNED", order_item_id: itemId, assigned_at: opts.created });
        await knex("deliveries").insert({
          order_id: oid, order_item_id: itemId, kind: it.deliveryType === "AUTO" ? "AUTO" : "MANUAL", status: "DELIVERED",
          content_text: "Thanks for your purchase! Your item is below.", secret_payload: claimed ? String(claimed.value) : "SEED-DELIVERY-INFO",
          file_path: claimed && claimed.item_type === "FILE" ? claimed.value : null, file_name: claimed?.file_name || null,
          download_token: crypto.randomBytes(16).toString("hex"), delivered_by: null, attempt_count: 1,
          logs: "[]", created_at: opts.created, updated_at: opts.created
        });
        await knex("order_status_history").insert({ order_id: oid, from_status: "PAID", to_status: "COMPLETED", actor_role: "SYSTEM", reason: "delivered", created_at: opts.created });
      } else if (opts.status === "PROCESSING") {
        await knex("order_status_history").insert({ order_id: oid, from_status: "PAID", to_status: "PROCESSING", actor_role: "SYSTEM", reason: "manual queue", created_at: opts.created });
      }
    }
    if (opts.withTxn && opts.balanceAfter !== undefined) {
      await knex("wallet_transactions").insert({
        ref: `WLT-${opts.created.slice(2, 10).replace(/-/g, "")}-P${oid}`, user_id: opts.uid, type: "PURCHASE",
        amount_minor: -Math.abs(opts.total), balance_before_minor: opts.balanceAfter + opts.total, balance_after_minor: opts.balanceAfter,
        order_id: oid, created_by: null, reason: `Purchase ${opts.codePrefix}`, idempotency_key: `pay:seed:${oid}`, created_at: opts.created
      });
    }
    return oid;
  };

  await mkOrder({ uid: u1, codePrefix: "ORD-SEED-0001", status: "COMPLETED", total: 992, created: daysAgo(6), withTxn: true, balanceAfter: 4008, items: [{ pid: prodIds["windows-11-key"], name: "Windows 11 Pro Key", qty: 1, price: 110, deliveryType: "AUTO", delivered: true }, { pid: prodIds["steam-giftcard"], name: "Steam Wallet Card $20", qty: 1, price: 207, deliveryType: "AUTO", delivered: true }, { pid: prodIds["pubg-uc"], name: "PUBG Mobile UC", qty: 5, price: 135, deliveryType: "MANUAL", delivered: true }] });
  await mkOrder({ uid: u2, codePrefix: "ORD-SEED-0002", status: "PROCESSING", total: 390, created: daysAgo(1), withTxn: true, balanceAfter: 2610, items: [{ pid: prodIds["netflix-premium"], name: "Netflix Premium (Shared)", qty: 1, price: 390, deliveryType: "MANUAL" }] });
  await mkOrder({ uid: u3, codePrefix: "ORD-SEED-0003", status: "COMPLETED", total: 318, created: daysAgo(3), withTxn: true, balanceAfter: 1682, items: [{ pid: prodIds["chatgpt-plus"], name: "ChatGPT Plus (1 ខែ)", qty: 1, price: 169, deliveryType: "MANUAL", delivered: true }, { pid: prodIds["canva-pro"], name: "Canva Pro Account (1 ខែ)", qty: 1, price: 149, deliveryType: "MANUAL", delivered: true }] });
  await mkOrder({ uid: u1, codePrefix: "ORD-SEED-0004", status: "CANCELLED", total: 200, created: daysAgo(2), items: [{ pid: prodIds["googleplay-25"], name: "Google Play Gift $25", qty: 1, price: 258, deliveryType: "AUTO", delivered: false }] });

  // give u3 a wallet deposit row as well
  await knex("wallet_transactions").insert([
    { ref: "WLT-260102-BBB002", user_id: u2, type: "DEPOSIT", amount_minor: 3000, balance_before_minor: 0, balance_after_minor: 3000, deposit_id: null, created_by: adminU, reason: "Top-up via ABA_KHQR", idempotency_key: "seed:dep2", created_at: daysAgo(9) },
    { ref: "WLT-260103-CCC003", user_id: u3, type: "DEPOSIT", amount_minor: 2000, balance_before_minor: 0, balance_after_minor: 2000, deposit_id: null, created_by: adminU, reason: "Top-up via Wing", idempotency_key: "seed:dep3", created_at: daysAgo(5) }
  ]);

  // notifications
  await knex("notifications").insert([
    { user_id: u1, kind: "DELIVERED", title: "Order ORD-SEED-0001 delivered", body: "Your keys are ready in Order Details.", link: "/orders/ORD-SEED-0001", is_read: 1, telegram_state: "NONE", telegram_attempts: 0, created_at: daysAgo(6) },
    { user_id: u2, kind: "DEPOSIT_APPROVED", title: "Top-up approved: 30.00 USD", body: "Deposit DEP via ABA_KHQR credited.", link: "/wallet", is_read: 0, telegram_state: "NONE", telegram_attempts: 0, created_at: daysAgo(9) }
  ]);

  fs.mkdirSync(path.join(config.uploads.dir, "seed"), { recursive: true });
  if (!fs.existsSync(path.join(config.uploads.dir, "seed", "sample.txt"))) {
    fs.writeFileSync(path.join(config.uploads.dir, "seed", "sample.txt"), "Digital Store sample file — replace via Admin Panel.\n");
  }

  console.log("seed complete");
}
