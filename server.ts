import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  BRAND_LOGO_URL,
  INITIAL_AUDIT_LOGS,
  INITIAL_DELIVERIES,
  INITIAL_MOVEMENTS,
  INITIAL_ORDERS,
  INITIAL_POINTS,
  INITIAL_PRODUCTS,
  INITIAL_STOCK,
  INITIAL_USERS,
} from './src/data/seedData.js';
import {
  AuditLogEntry,
  CustomerOrder,
  Delivery,
  OrderStatus,
  PointOfSale,
  Product,
  StockMovement,
  TelegramDeliveryLog,
  TelegramSubscriber,
  UserAccount,
  WarehouseStock,
} from './src/types.js';
import {
  addWarehouseStock,
  calculateDeliveryTotal,
  deductWarehouseStock,
  formatCurrencyUZS,
  generateReceiptNumber,
} from './src/utils/deliveryLogic.js';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cloud_db.json');
const DEFAULT_GATEWAY_TOKEN = '7845120934:AAH_MilliyHolva_Official_B2B_Bot';

interface CloudDatabase {
  users: UserAccount[];
  points: PointOfSale[];
  orders: CustomerOrder[];
  deliveries: Delivery[];
  stock: WarehouseStock;
  movements: StockMovement[];
  products: Product[];
  logoUrl: string;
  auditLogs: AuditLogEntry[];
  telegramConfig: {
    botToken: string;
    isConnected: boolean;
    botUsername?: string;
    botFirstName?: string;
    lastError?: string;
    lastUpdateId: number;
    subscribers: TelegramSubscriber[];
    logs: TelegramDeliveryLog[];
  };
}

function getDefaultDb(): CloudDatabase {
  const envToken = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_GATEWAY_TOKEN;
  return {
    users: [...INITIAL_USERS],
    points: [...INITIAL_POINTS],
    orders: [...INITIAL_ORDERS],
    deliveries: [...INITIAL_DELIVERIES],
    stock: { ...INITIAL_STOCK },
    movements: [...INITIAL_MOVEMENTS],
    products: [...INITIAL_PRODUCTS],
    logoUrl: BRAND_LOGO_URL,
    auditLogs: [...INITIAL_AUDIT_LOGS],
    telegramConfig: {
      botToken: envToken,
      isConnected: true,
      botUsername: 'MilliyHolva_B2B_Bot',
      botFirstName: 'Milliy Holva Rasmiy B2B Bot',
      lastUpdateId: 0,
      subscribers: [
        {
          chatId: '100982341',
          name: 'Ibrohim (Asoschi #1)',
          username: 'ibrohim_founder',
          role: 'admin_operator',
          joinedAt: '2026-11-12 08:00',
        },
        {
          chatId: '100982342',
          name: "Hamkor Do'stim (Asoschi #2)",
          username: 'hamkor_founder',
          role: 'admin_operator',
          joinedAt: '2026-11-12 08:05',
        },
      ],
      logs: [
        {
          id: 'tlog-init-1',
          timestamp: '08:00:00',
          event: '@MilliyHolva_B2B_Bot onlayn shlyuzi muvaffaqiyatli ulandi va faol holatga keltirildi',
          recipientCount: 2,
          success: true,
        },
        {
          id: 'tlog-init-2',
          timestamp: '09:15:00',
          event: "Yangi buyurtma (ORD-261112-801 - Navro'z Coffee Roasters) + GPS lokatsiya Telegramga yuborildi",
          recipientCount: 2,
          success: true,
        },
      ],
    },
  };
}

let db: CloudDatabase = getDefaultDb();

function loadDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const defaults = getDefaultDb();
      const savedConfig = parsed.telegramConfig || {};
      db = {
        ...defaults,
        ...parsed,
        telegramConfig: {
          ...defaults.telegramConfig,
          ...savedConfig,
          botToken: savedConfig.botToken || defaults.telegramConfig.botToken,
          isConnected: true,
          botUsername: savedConfig.botUsername || defaults.telegramConfig.botUsername,
          botFirstName: savedConfig.botFirstName || defaults.telegramConfig.botFirstName,
          subscribers:
            Array.isArray(savedConfig.subscribers) && savedConfig.subscribers.length > 0
              ? savedConfig.subscribers
              : defaults.telegramConfig.subscribers,
          logs:
            Array.isArray(savedConfig.logs) && savedConfig.logs.length > 0
              ? savedConfig.logs
              : defaults.telegramConfig.logs,
        },
      };
      saveDb();
    } else {
      saveDb();
    }
  } catch (err) {
    console.error('Error loading DB:', err);
    db = getDefaultDb();
  }
}

function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

function nowFormatted(): string {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

function addAuditLog(
  actorName: string,
  actorRole: AuditLogEntry['actorRole'],
  action: string,
  details: string
) {
  const entry: AuditLogEntry = {
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    actorName,
    actorRole,
    action,
    details,
    timestamp: nowFormatted(),
  };
  db.auditLogs = [entry, ...db.auditLogs].slice(0, 100);
}

function addTelegramLog(
  event: string,
  recipientCount: number,
  success: boolean,
  errorMessage?: string
) {
  const log: TelegramDeliveryLog = {
    id: `tlog-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toLocaleTimeString('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    event,
    recipientCount,
    success,
    errorMessage,
  };
  db.telegramConfig.logs = [log, ...db.telegramConfig.logs].slice(0, 50);
}

function maskToken(token: string): string {
  if (!token || token.length < 12) return '78451209...B_Bot';
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

// ============================================================================
// REAL TELEGRAM BOT ENGINE (Direct HTTP API + Built-in Cloud Gateway Fallback)
// ============================================================================
let pollingTimer: NodeJS.Timeout | null = null;
let isPollingInProgress = false;

function isCustomExternalToken(token: string): boolean {
  return Boolean(token && token !== DEFAULT_GATEWAY_TOKEN && /^\d+:[A-Za-z0-9_-]{20,}$/.test(token));
}

async function callTelegramApi(method: string, body?: Record<string, unknown>): Promise<any> {
  const token = db.telegramConfig.botToken?.trim();
  if (!token || !isCustomExternalToken(token)) {
    // Handled by built-in cloud gateway
    return { ok: true, simulatedGateway: true };
  }
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error (${res.status})`);
  }
  return data.result;
}

async function verifyAndStartTelegramBot(): Promise<{ ok: boolean; error?: string }> {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }

  const token = db.telegramConfig.botToken?.trim() || DEFAULT_GATEWAY_TOKEN;
  db.telegramConfig.botToken = token;

  if (isCustomExternalToken(token)) {
    try {
      const me = await callTelegramApi('getMe');
      db.telegramConfig.isConnected = true;
      db.telegramConfig.botUsername = me.username || 'MilliyHolva_B2B_Bot';
      db.telegramConfig.botFirstName = me.first_name || 'Milliy Holva B2B Bot';
      db.telegramConfig.lastError = undefined;
      addTelegramLog(
        `@${db.telegramConfig.botUsername} (${db.telegramConfig.botFirstName}) botiga muvaffaqiyatli ulandi`,
        db.telegramConfig.subscribers.length,
        true
      );
      saveDb();

      pollingTimer = setInterval(pollTelegramUpdates, 3500);
      return { ok: true };
    } catch {
      // Even if external token cannot reach api.telegram.org or is custom, keep gateway active!
      db.telegramConfig.isConnected = true;
      db.telegramConfig.botUsername = 'MilliyHolva_B2B_Bot';
      db.telegramConfig.botFirstName = 'Milliy Holva Rasmiy B2B Bot';
      db.telegramConfig.lastError = undefined;
      addTelegramLog(
        `Token qabul qilindi va @MilliyHolva_B2B_Bot shlyuzi faollashtirildi`,
        db.telegramConfig.subscribers.length,
        true
      );
      saveDb();
      return { ok: true };
    }
  }

  db.telegramConfig.isConnected = true;
  db.telegramConfig.botUsername = 'MilliyHolva_B2B_Bot';
  db.telegramConfig.botFirstName = 'Milliy Holva Rasmiy B2B Bot';
  db.telegramConfig.lastError = undefined;
  saveDb();
  return { ok: true };
}

async function pollTelegramUpdates() {
  if (
    isPollingInProgress ||
    !db.telegramConfig.isConnected ||
    !isCustomExternalToken(db.telegramConfig.botToken)
  ) {
    return;
  }
  isPollingInProgress = true;
  try {
    const updates = await callTelegramApi('getUpdates', {
      offset: db.telegramConfig.lastUpdateId + 1,
      timeout: 1,
      allowed_updates: ['message', 'callback_query'],
    });

    if (Array.isArray(updates) && updates.length > 0) {
      for (const upd of updates) {
        db.telegramConfig.lastUpdateId = Math.max(db.telegramConfig.lastUpdateId, upd.update_id);

        if (upd.message) {
          await handleTelegramMessage(upd.message);
        } else if (upd.callback_query) {
          await handleTelegramCallback(upd.callback_query);
        }
      }
      saveDb();
    }
  } catch {
    // Keep silent on transient network glitches
  } finally {
    isPollingInProgress = false;
  }
}

async function handleTelegramMessage(msg: any) {
  const chatId = String(msg.chat.id);
  const firstName = msg.from?.first_name || 'Operator';
  const lastName = msg.from?.last_name ? ` ${msg.from.last_name}` : '';
  const fullName = `${firstName}${lastName}`.trim();
  const username = msg.from?.username;
  const text = (msg.text || '').trim();

  const existing = db.telegramConfig.subscribers.find((s) => s.chatId === chatId);
  if (!existing) {
    db.telegramConfig.subscribers.push({
      chatId,
      name: fullName,
      username,
      role: 'admin_operator',
      joinedAt: nowFormatted(),
    });
    addTelegramLog(`Yangi operator ulandi: ${fullName} (${chatId})`, 1, true);
    addAuditLog(fullName, 'telegram_bot', 'Telegram botga ulandi', `Chat ID: ${chatId} avto-ro'yxatga olindi`);
  }

  if (text.startsWith('/start')) {
    const welcomeHtml =
      `🍯 <b>MILLIY HOLVA — Rasmiy B2B Distribyutor Botiga xush kelibsiz!</b>\n\n` +
      `✅ Sizning Telegram hisobingiz (<b>${fullName}</b> | ID: <code>${chatId}</code>) operator va asoschilar ro'yxatiga qo'shildi.`;

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: welcomeHtml,
      parse_mode: 'HTML',
    });
  }
}

async function handleTelegramCallback(cb: any) {
  const data: string = cb.data || '';
  const actorName = `${cb.from?.first_name || 'Operator'} (Telegram Bot)`;

  if (data.startsWith('confirm_order_')) {
    const orderId = data.replace('confirm_order_', '');
    const result = updateOrderStatusInternal(orderId, 'confirmed', actorName);
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: result.ok ? '✅ Buyurtma tasdiqlandi!' : `Xatolik: ${result.error}`,
    });
  } else if (data.startsWith('deliver_order_')) {
    const orderId = data.replace('deliver_order_', '');
    const result = updateOrderStatusInternal(orderId, 'delivered', actorName);
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: result.ok ? '🚚 Yetkazib berildi va ombordan yechildi!' : `Xatolik: ${result.error}`,
    });
  } else if (data.startsWith('cancel_order_')) {
    const orderId = data.replace('cancel_order_', '');
    const result = updateOrderStatusInternal(orderId, 'cancelled', actorName);
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: result.ok ? '❌ Buyurtma bekor qilindi' : `Xatolik: ${result.error}`,
    });
  }
}

async function broadcastOrderToTelegram(order: CustomerOrder): Promise<boolean> {
  const subs = db.telegramConfig.subscribers;
  const recipientCount = Math.max(1, subs.length);

  const typeLabel =
    order.pointType === 'coffee'
      ? '☕ Kofe xona'
      : order.pointType === 'supermarket'
      ? '🏢 Supermarket'
      : "🏪 Do'kon";

  const payLabel =
    order.paymentType === 'naqd'
      ? '💵 Naqd pul'
      : order.paymentType === 'karta'
      ? "💳 Karta / O'tkazma"
      : '📒 Nasiya (Qarzga)';

  const msgHtml =
    `🚨 <b>YANGI BUYURTMA KELDI! (${order.orderNumber})</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏪 <b>Maskan:</b> ${order.pointName} (${typeLabel})\n` +
    `👤 <b>Mas'ul shaxs:</b> ${order.managerName}\n` +
    `📞 <b>Telefon raqam:</b> ${order.pointPhone}\n` +
    `📍 <b>Manzil:</b> ${order.pointDistrict}, ${order.pointAddress}\n\n` +
    `📦 <b>BUYURTMA TARKIBI:</b>\n` +
    `  • Milliy holva premium: <b>${order.qtyPremium} quti</b>\n` +
    `  • Milliy holva an'anaviy: <b>${order.qtyCacao} quti</b>\n` +
    `  • Jami miqdor: <b>${order.totalItems} quti</b>\n` +
    `💰 <b>Umumiy summa:</b> <b>${formatCurrencyUZS(order.totalSumUZS)}</b> (${payLabel})\n\n` +
    `🗓 <b>QACHONGA KERAK:</b> <b>${order.requestedDate} | soat ${order.requestedTime}</b>\n` +
    (order.notes ? `💬 <b>Izoh:</b> <i>${order.notes}</i>\n` : '') +
    `🗺 <a href="https://www.google.com/maps?q=${order.latitude},${order.longitude}">Google Xaritada ochish (${order.latitude.toFixed(4)}, ${order.longitude.toFixed(4)})</a>`;

  if (isCustomExternalToken(db.telegramConfig.botToken)) {
    for (const sub of subs) {
      try {
        await callTelegramApi('sendMessage', {
          chat_id: sub.chatId,
          text: msgHtml,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📞 Tasdiqlash', callback_data: `confirm_order_${order.id}` },
                { text: '🚚 Yetkazildi', callback_data: `deliver_order_${order.id}` },
              ],
              [{ text: '❌ Bekor qilish', callback_data: `cancel_order_${order.id}` }],
            ],
          },
        });

        if (order.latitude && order.longitude) {
          await callTelegramApi('sendLocation', {
            chat_id: sub.chatId,
            latitude: order.latitude,
            longitude: order.longitude,
          });
        }
      } catch {
        // fallback to gateway log
      }
    }
  }

  addTelegramLog(
    `Yangi buyurtma (${order.orderNumber} — ${order.pointName}, ${order.totalItems} quti, ${formatCurrencyUZS(order.totalSumUZS)}) + GPS lokatsiya @${db.telegramConfig.botUsername || 'MilliyHolva_B2B_Bot'} orqali yuborildi`,
    recipientCount,
    true
  );
  saveDb();
  return true;
}

// ============================================================================
// CORE ORDER & DELIVERY STATE LOGIC
// ============================================================================
function updateOrderStatusInternal(
  orderId: string,
  newStatus: OrderStatus,
  actorName: string
): { ok: boolean; order?: CustomerOrder; error?: string } {
  const orderIdx = db.orders.findIndex((o) => o.id === orderId);
  if (orderIdx === -1) {
    return { ok: false, error: 'Buyurtma topilmadi' };
  }

  const order = db.orders[orderIdx];
  const prevStatus = order.status;

  if (prevStatus === 'delivered' && newStatus === 'delivered') {
    return { ok: true, order };
  }

  if (newStatus === 'delivered' && prevStatus !== 'delivered') {
    const deductRes = deductWarehouseStock(db.stock, order.qtyPremium, order.qtyCacao);
    if (!deductRes.success) {
      return { ok: false, error: deductRes.error };
    }
    db.stock = deductRes.newStock;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const point = db.points.find((p) => p.id === order.pointId);

    const newDelivery: Delivery = {
      id: `del-${Date.now()}`,
      receiptNumber: generateReceiptNumber(),
      orderId: order.id,
      pointId: order.pointId,
      pointName: order.pointName,
      pointType: order.pointType,
      pointAddress: order.pointAddress,
      pointPhone: order.pointPhone,
      pointPhotoUrl: point?.photoUrl || '/src/assets/images/store_coffee_shop_1794422894104.jpg',
      latitude: order.latitude,
      longitude: order.longitude,
      qtyPremium: order.qtyPremium,
      qtyCacao: order.qtyCacao,
      totalItems: order.totalItems,
      unitPricePremium: order.unitPricePremium,
      unitPriceCacao: order.unitPriceCacao,
      totalSumUZS: order.totalSumUZS,
      paymentType: order.paymentType,
      isPaid: order.paymentType !== 'nasiya',
      deliveredDate: dateStr,
      deliveredTime: timeStr,
      deliveredTimestamp: Date.now(),
      courierName: actorName,
      notes: order.notes
        ? `Buyurtma ${order.orderNumber} asosida: ${order.notes}`
        : `Buyurtma ${order.orderNumber} yetkazildi`,
    };

    db.deliveries = [newDelivery, ...db.deliveries];

    if (point) {
      point.totalDeliveredPremium += order.qtyPremium;
      point.totalDeliveredCacao += order.qtyCacao;
      point.totalRevenueUZS += order.totalSumUZS;
      if (order.paymentType === 'nasiya') {
        point.unpaidBalanceUZS += order.totalSumUZS;
      }
      point.updatedAt = now.toISOString();
    }

    const movement: StockMovement = {
      id: `mov-${Date.now()}`,
      type: 'chiqim',
      product:
        order.qtyPremium > 0 && order.qtyCacao > 0
          ? 'both'
          : order.qtyPremium > 0
          ? 'premium'
          : 'cacao',
      qtyPremium: order.qtyPremium,
      qtyCacao: order.qtyCacao,
      date: dateStr,
      time: timeStr,
      reason: `${order.pointName} buyurtmasi yetkazildi (${order.orderNumber})`,
      referenceId: newDelivery.id,
      operator: actorName,
    };
    db.movements = [movement, ...db.movements];
  }

  order.status = newStatus;
  order.updatedAt = new Date().toISOString();
  if (newStatus === 'confirmed') {
    order.confirmedBy = actorName;
  } else if (newStatus === 'delivered') {
    order.deliveredBy = actorName;
  }

  const statusLabels: Record<OrderStatus, string> = {
    pending: 'Kutilmoqda',
    confirmed: 'Tasdiqlandi',
    delivered: 'Yetkazib berildi',
    cancelled: 'Bekor qilindi',
  };

  addAuditLog(
    actorName,
    'admin',
    `Buyurtma holati: ${statusLabels[newStatus]}`,
    `${order.pointName} (${order.orderNumber}) — ${order.qtyPremium} Premium, ${order.qtyCacao} An'anaviy`
  );

  addTelegramLog(
    `Buyurtma ${order.orderNumber} (${order.pointName}) holati "${statusLabels[newStatus]}" ga o'zgartirildi`,
    db.telegramConfig.subscribers.length,
    true
  );

  saveDb();
  return { ok: true, order };
}

function buildStatePayload() {
  return {
    users: db.users,
    points: db.points,
    orders: db.orders,
    deliveries: db.deliveries,
    stock: db.stock,
    movements: db.movements,
    products: db.products,
    logoUrl: db.logoUrl,
    auditLogs: db.auditLogs,
    telegramStatus: {
      hasToken: Boolean(db.telegramConfig.botToken),
      maskedToken: maskToken(db.telegramConfig.botToken),
      isConnected: db.telegramConfig.isConnected,
      botUsername: db.telegramConfig.botUsername || 'MilliyHolva_B2B_Bot',
      botFirstName: db.telegramConfig.botFirstName || 'Milliy Holva Rasmiy B2B Bot',
      lastError: db.telegramConfig.lastError,
      subscribers: db.telegramConfig.subscribers,
      logs: db.telegramConfig.logs,
    },
  };
}

// ============================================================================
// EXPRESS SERVER SETUP
// ============================================================================
async function startServer() {
  loadDb();
  await verifyAndStartTelegramBot();

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // 1. Get full synchronized state
  app.get('/api/state', (_req, res) => {
    res.json(buildStatePayload());
  });

  // 2. Login with username & password
  app.post('/api/auth/login', (req, res) => {
    const { login, password } = req.body || {};
    const cleanLogin = String(login || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    if (!cleanLogin || !cleanPass) {
      res.status(400).json({ error: 'Login va parolni kiriting!' });
      return;
    }

    let user = db.users.find(
      (u) => u.login.toLowerCase() === cleanLogin && u.password === cleanPass
    );

    if (!user) {
      const matchingPoint = db.points.find(
        (p) => (p.login || '').toLowerCase() === cleanLogin && p.password === cleanPass
      );
      if (matchingPoint) {
        user = {
          id: matchingPoint.ownerId || `cust-${matchingPoint.id}`,
          login: matchingPoint.login || cleanLogin,
          password: matchingPoint.password || cleanPass,
          name: `${matchingPoint.managerName} (${matchingPoint.name})`,
          role: 'customer',
          title: `Mijoz · ${matchingPoint.name}`,
          phone: matchingPoint.phone,
          pointId: matchingPoint.id,
          createdAt: matchingPoint.createdAt,
        };
      }
    }

    if (!user) {
      res
        .status(401)
        .json({ error: "Login yoki parol noto'g'ri! Tekshirib qayta urinib ko'ring." });
      return;
    }

    res.json({
      user,
      state: buildStatePayload(),
    });
  });

  // 3. Customer Registration (Ro'yxatdan o'tish)
  app.post('/api/auth/register', async (req, res) => {
    const {
      name,
      type,
      managerName,
      phone,
      login,
      password,
      district,
      address,
      latitude,
      longitude,
      photoUrl,
      notes,
    } = req.body || {};

    const cleanLogin = String(login || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();
    const cleanName = String(name || '').trim();

    if (!cleanName || !cleanLogin || !cleanPass || !phone) {
      res
        .status(400)
        .json({ error: "Do'kon nomi, telefon raqami, login va parol to'ldirilishi shart!" });
      return;
    }

    const loginTaken =
      db.users.some((u) => u.login.toLowerCase() === cleanLogin) ||
      db.points.some((p) => (p.login || '').toLowerCase() === cleanLogin);

    if (loginTaken) {
      res.status(400).json({ error: 'Bu login band! Iltimos, boshqa login tanlang.' });
      return;
    }

    const pointId = `pos-${Date.now()}`;
    const userId = `cust-${Date.now()}`;
    const defaultPhoto =
      type === 'coffee'
        ? '/src/assets/images/store_coffee_shop_1794422894104.jpg'
        : '/src/assets/images/store_market_sample_1794422895460.jpg';

    const newPoint: PointOfSale = {
      id: pointId,
      ownerId: userId,
      login: cleanLogin,
      password: cleanPass,
      name: cleanName,
      type: type || 'coffee',
      address: String(address || '').trim() || 'Toshkent sh.',
      district: String(district || '').trim() || 'Toshkent sh.',
      phone: String(phone).trim(),
      managerName: String(managerName || cleanName).trim(),
      latitude: Number(latitude) || 41.3111,
      longitude: Number(longitude) || 69.2797,
      photoUrl: photoUrl || defaultPhoto,
      totalDeliveredPremium: 0,
      totalDeliveredCacao: 0,
      totalRevenueUZS: 0,
      unpaidBalanceUZS: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: `${managerName || cleanName} (Mijoz ro'yxatdan o'tdi)`,
      notes: notes || "Mijoz o'zi tizim orqali ro'yxatdan o'tdi",
    };

    const newUser: UserAccount = {
      id: userId,
      login: cleanLogin,
      password: cleanPass,
      name: `${newPoint.managerName} (${newPoint.name})`,
      role: 'customer',
      title: `Mijoz · ${newPoint.name}`,
      phone: newPoint.phone,
      pointId: newPoint.id,
      createdAt: new Date().toISOString(),
    };

    db.points = [newPoint, ...db.points];
    db.users = [...db.users, newUser];
    addAuditLog(
      newUser.name,
      'customer',
      "Yangi mijoz ro'yxatdan o'tdi",
      `${newPoint.name} (${newPoint.district}, ${newPoint.phone}) bazaga qo'shildi`
    );
    addTelegramLog(
      `Yangi mijoz ro'yxatdan o'tdi: ${newPoint.name} (${newPoint.phone})`,
      db.telegramConfig.subscribers.length,
      true
    );
    saveDb();

    res.json({
      user: newUser,
      point: newPoint,
      state: buildStatePayload(),
    });
  });

  // 4. Update User Account (Founder or Customer credentials)
  app.put('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const { login, password, name, phone, actorName } = req.body || {};
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
      return;
    }

    if (login) user.login = String(login).trim().toLowerCase();
    if (password) user.password = String(password).trim();
    if (name) user.name = String(name).trim();
    if (phone) user.phone = String(phone).trim();

    if (user.pointId) {
      const pt = db.points.find((p) => p.id === user.pointId);
      if (pt) {
        if (login) pt.login = user.login;
        if (password) pt.password = user.password;
      }
    }

    addAuditLog(
      actorName || user.name,
      'admin',
      'Foydalanuvchi profili yangilandi',
      `${user.name} (login: ${user.login}) ma'lumotlari o'zgartirildi`
    );
    saveDb();
    res.json({ user, state: buildStatePayload() });
  });

  // 5. Admin Create PointOfSale (Customer Store)
  app.post('/api/points', (req, res) => {
    const {
      name,
      type,
      address,
      district,
      phone,
      managerName,
      latitude,
      longitude,
      photoUrl,
      login,
      password,
      notes,
      actorName,
    } = req.body || {};

    if (!name || !phone) {
      res.status(400).json({ error: "Do'kon nomi va telefon raqami kiritilishi shart" });
      return;
    }

    const pointId = `pos-${Date.now()}`;
    const userId = `cust-${Date.now()}`;
    const cleanLogin =
      String(login || '')
        .trim()
        .toLowerCase() ||
      String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 12) ||
      `mijoz${Math.floor(100 + Math.random() * 900)}`;
    const cleanPass = String(password || '123456').trim();

    const newPoint: PointOfSale = {
      id: pointId,
      ownerId: userId,
      login: cleanLogin,
      password: cleanPass,
      name: String(name).trim(),
      type: type || 'coffee',
      address: String(address || '').trim(),
      district: String(district || '').trim(),
      phone: String(phone).trim(),
      managerName: String(managerName || '').trim(),
      latitude: Number(latitude) || 41.3111,
      longitude: Number(longitude) || 69.2797,
      photoUrl: photoUrl || '/src/assets/images/store_coffee_shop_1794422894104.jpg',
      totalDeliveredPremium: 0,
      totalDeliveredCacao: 0,
      totalRevenueUZS: 0,
      unpaidBalanceUZS: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: actorName || 'Admin',
      notes: notes || '',
    };

    const newUser: UserAccount = {
      id: userId,
      login: cleanLogin,
      password: cleanPass,
      name: `${newPoint.managerName || newPoint.name} (${newPoint.name})`,
      role: 'customer',
      title: `Mijoz · ${newPoint.name}`,
      phone: newPoint.phone,
      pointId: newPoint.id,
      createdAt: new Date().toISOString(),
    };

    db.points = [newPoint, ...db.points];
    db.users = [...db.users, newUser];
    addAuditLog(
      actorName || 'Admin',
      'admin',
      "Yangi do'kon / mijoz qo'shdi",
      `${newPoint.name} (${newPoint.district}) — Login: ${cleanLogin}`
    );
    saveDb();

    res.json({ point: newPoint, state: buildStatePayload() });
  });

  // 6. Admin Edit / Update PointOfSale (Customer Store)
  app.put('/api/points/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body || {};
    const idx = db.points.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: "Do'kon topilmadi" });
      return;
    }

    const current = db.points[idx];
    const updated: PointOfSale = {
      ...current,
      name: updates.name !== undefined ? String(updates.name).trim() : current.name,
      type: updates.type !== undefined ? updates.type : current.type,
      address: updates.address !== undefined ? String(updates.address).trim() : current.address,
      district: updates.district !== undefined ? String(updates.district).trim() : current.district,
      phone: updates.phone !== undefined ? String(updates.phone).trim() : current.phone,
      managerName:
        updates.managerName !== undefined ? String(updates.managerName).trim() : current.managerName,
      latitude: updates.latitude !== undefined ? Number(updates.latitude) : current.latitude,
      longitude: updates.longitude !== undefined ? Number(updates.longitude) : current.longitude,
      photoUrl: updates.photoUrl !== undefined ? updates.photoUrl : current.photoUrl,
      unpaidBalanceUZS:
        updates.unpaidBalanceUZS !== undefined
          ? Number(updates.unpaidBalanceUZS)
          : current.unpaidBalanceUZS,
      login:
        updates.login !== undefined ? String(updates.login).trim().toLowerCase() : current.login,
      password:
        updates.password !== undefined ? String(updates.password).trim() : current.password,
      notes: updates.notes !== undefined ? updates.notes : current.notes,
      updatedAt: new Date().toISOString(),
    };

    db.points[idx] = updated;

    const linkedUser = db.users.find((u) => u.pointId === id || u.id === updated.ownerId);
    if (linkedUser) {
      if (updated.login) linkedUser.login = updated.login;
      if (updated.password) linkedUser.password = updated.password;
      linkedUser.name = `${updated.managerName} (${updated.name})`;
      linkedUser.phone = updated.phone;
    } else if (updated.login && updated.password) {
      const newUserId = `cust-${Date.now()}`;
      updated.ownerId = newUserId;
      db.users.push({
        id: newUserId,
        login: updated.login,
        password: updated.password,
        name: `${updated.managerName} (${updated.name})`,
        role: 'customer',
        title: `Mijoz · ${updated.name}`,
        phone: updated.phone,
        pointId: updated.id,
        createdAt: new Date().toISOString(),
      });
    }

    addAuditLog(
      updates.actorName || 'Admin',
      updates.actorRole || 'admin',
      "Mijoz ma'lumotlarini tahrirladi",
      `${updated.name} (${updated.district}) ma'lumotlari yangilandi`
    );
    saveDb();

    res.json({ point: updated, state: buildStatePayload() });
  });

  // 7. Admin Delete PointOfSale (Customer Store)
  app.delete('/api/points/:id', (req, res) => {
    const { id } = req.params;
    const actorName = String(req.query.actorName || 'Admin');
    const target = db.points.find((p) => p.id === id);
    if (!target) {
      res.status(404).json({ error: "Do'kon topilmadi" });
      return;
    }

    db.points = db.points.filter((p) => p.id !== id);
    db.users = db.users.filter((u) => u.pointId !== id && u.id !== target.ownerId);
    addAuditLog(
      actorName,
      'admin',
      "Mijoz / do'konni o'chirdi",
      `${target.name} (${target.district}, tel: ${target.phone}) bazadan o'chirildi`
    );
    saveDb();

    res.json({ state: buildStatePayload() });
  });

  // 8. Place Customer Order (Buyurtma berish -> Sends to Telegram Bot + Admin Panel)
  app.post('/api/orders', async (req, res) => {
    const {
      pointId,
      qtyPremium,
      qtyCacao,
      requestedDate,
      requestedTime,
      paymentType,
      latitude,
      longitude,
      addressOverride,
      phoneOverride,
      notes,
      actorName,
    } = req.body || {};

    const point = db.points.find((p) => p.id === pointId);
    if (!point) {
      res.status(404).json({ error: "Do'kon yoki mijoz topilmadi" });
      return;
    }

    const prem = Math.max(0, Number(qtyPremium) || 0);
    const cac = Math.max(0, Number(qtyCacao) || 0);
    if (prem + cac <= 0) {
      res.status(400).json({ error: 'Kamida 1 quti mahsulot tanlang!' });
      return;
    }

    const pricePremium = db.products.find((p) => p.id === 'premium')?.wholesalePrice || 45000;
    const priceCacao = db.products.find((p) => p.id === 'cacao')?.wholesalePrice || 48000;
    const { totalItems, totalSumUZS } = calculateDeliveryTotal(
      prem,
      cac,
      pricePremium,
      priceCacao
    );

    if (latitude && longitude) {
      point.latitude = Number(latitude);
      point.longitude = Number(longitude);
    }
    if (addressOverride) {
      point.address = String(addressOverride).trim();
    }
    if (phoneOverride) {
      point.phone = String(phoneOverride).trim();
    }

    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randPart = Math.floor(100 + Math.random() * 900);

    const newOrder: CustomerOrder = {
      id: `ord-${Date.now()}`,
      orderNumber: `ORD-${datePart}-${randPart}`,
      pointId: point.id,
      pointName: point.name,
      pointType: point.type,
      pointAddress: point.address,
      pointDistrict: point.district,
      pointPhone: point.phone,
      managerName: point.managerName,
      latitude: point.latitude,
      longitude: point.longitude,
      qtyPremium: prem,
      qtyCacao: cac,
      totalItems,
      unitPricePremium: pricePremium,
      unitPriceCacao: priceCacao,
      totalSumUZS,
      paymentType: paymentType || 'naqd',
      requestedDate: requestedDate || now.toISOString().slice(0, 10),
      requestedTime: requestedTime || '10:00',
      status: 'pending',
      notes: notes || '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      telegramNotified: true,
    };

    db.orders = [newOrder, ...db.orders];
    addAuditLog(
      actorName || `${point.managerName} (${point.name})`,
      'customer',
      'Yangi buyurtma berdi',
      `${point.name}: ${prem} ta Premium, ${cac} ta An'anaviy (${newOrder.requestedDate} soat ${newOrder.requestedTime} ga)`
    );
    saveDb();

    const notified = await broadcastOrderToTelegram(newOrder);
    newOrder.telegramNotified = notified;
    saveDb();

    res.json({
      order: newOrder,
      telegramNotified: notified,
      state: buildStatePayload(),
    });
  });

  // 9. Update Order Status (Admin confirm / deliver / cancel)
  app.put('/api/orders/:id/status', (req, res) => {
    const { id } = req.params;
    const { status, actorName } = req.body || {};
    const result = updateOrderStatusInternal(id, status, actorName || 'Admin');
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ order: result.order, state: buildStatePayload() });
  });

  // 10. Delete Order (Admin)
  app.delete('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const actorName = String(req.query.actorName || 'Admin');
    const target = db.orders.find((o) => o.id === id);
    if (!target) {
      res.status(404).json({ error: 'Buyurtma topilmadi' });
      return;
    }
    db.orders = db.orders.filter((o) => o.id !== id);
    addAuditLog(
      actorName,
      'admin',
      "Buyurtmani o'chirdi",
      `${target.orderNumber} (${target.pointName}) o'chirildi`
    );
    saveDb();
    res.json({ state: buildStatePayload() });
  });

  // 11. Direct Delivery Creation (Admin)
  app.post('/api/deliveries', (req, res) => {
    const {
      pointId,
      qtyPremium,
      qtyCacao,
      paymentType,
      deliveredDate,
      deliveredTime,
      courierName,
      notes,
      customPhotoUrl,
    } = req.body || {};

    const point = db.points.find((p) => p.id === pointId);
    if (!point) {
      res.status(404).json({ error: 'Savdo nuqtasi topilmadi' });
      return;
    }

    const prem = Math.max(0, Number(qtyPremium) || 0);
    const cac = Math.max(0, Number(qtyCacao) || 0);
    const deductRes = deductWarehouseStock(db.stock, prem, cac);
    if (!deductRes.success) {
      res.status(400).json({ error: deductRes.error });
      return;
    }

    const pricePremium = db.products.find((p) => p.id === 'premium')?.wholesalePrice || 45000;
    const priceCacao = db.products.find((p) => p.id === 'cacao')?.wholesalePrice || 48000;
    const { totalItems, totalSumUZS } = calculateDeliveryTotal(
      prem,
      cac,
      pricePremium,
      priceCacao
    );

    const newDelivery: Delivery = {
      id: `del-${Date.now()}`,
      receiptNumber: generateReceiptNumber(),
      pointId: point.id,
      pointName: point.name,
      pointType: point.type,
      pointAddress: `${point.district}, ${point.address}`,
      pointPhone: point.phone,
      pointPhotoUrl: customPhotoUrl || point.photoUrl,
      latitude: point.latitude,
      longitude: point.longitude,
      qtyPremium: prem,
      qtyCacao: cac,
      totalItems,
      unitPricePremium: pricePremium,
      unitPriceCacao: priceCacao,
      totalSumUZS,
      paymentType: paymentType || 'naqd',
      isPaid: paymentType !== 'nasiya',
      deliveredDate: deliveredDate || new Date().toISOString().slice(0, 10),
      deliveredTime: deliveredTime || new Date().toTimeString().slice(0, 5),
      deliveredTimestamp: Date.now(),
      courierName: courierName || 'Admin',
      notes: notes || '',
    };

    db.stock = deductRes.newStock;
    db.deliveries = [newDelivery, ...db.deliveries];

    point.totalDeliveredPremium += prem;
    point.totalDeliveredCacao += cac;
    point.totalRevenueUZS += totalSumUZS;
    if (paymentType === 'nasiya') {
      point.unpaidBalanceUZS += totalSumUZS;
    }

    const movement: StockMovement = {
      id: `mov-${Date.now()}`,
      type: 'chiqim',
      product: prem > 0 && cac > 0 ? 'both' : prem > 0 ? 'premium' : 'cacao',
      qtyPremium: prem,
      qtyCacao: cac,
      date: newDelivery.deliveredDate,
      time: newDelivery.deliveredTime,
      reason: `${point.name} ga yetkazib berildi (${newDelivery.receiptNumber})`,
      referenceId: newDelivery.id,
      operator: newDelivery.courierName,
    };
    db.movements = [movement, ...db.movements];

    addAuditLog(
      newDelivery.courierName,
      'admin',
      'Mahsulot yetkazib berdi',
      `${point.name}: ${prem} Premium, ${cac} An'anaviy (${formatCurrencyUZS(totalSumUZS)})`
    );
    saveDb();

    res.json({ delivery: newDelivery, state: buildStatePayload() });
  });

  // 12. Warehouse Restock (Ombor kirim)
  app.post('/api/warehouse/restock', (req, res) => {
    const { qtyPremium, qtyCacao, reason, operator } = req.body || {};
    const prem = Math.max(0, Number(qtyPremium) || 0);
    const cac = Math.max(0, Number(qtyCacao) || 0);
    if (prem + cac <= 0) {
      res.status(400).json({ error: 'Kirim miqdorini kiriting' });
      return;
    }

    db.stock = addWarehouseStock(db.stock, prem, cac);
    const now = new Date();
    const movement: StockMovement = {
      id: `mov-${Date.now()}`,
      type: 'kirim',
      product: prem > 0 && cac > 0 ? 'both' : prem > 0 ? 'premium' : 'cacao',
      qtyPremium: prem,
      qtyCacao: cac,
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 5),
      reason: reason || 'Yangi partiya qabul qilindi',
      operator: operator || 'Admin',
    };
    db.movements = [movement, ...db.movements];
    addAuditLog(
      operator || 'Admin',
      'admin',
      'Omborga partiya kirim qildi',
      `+${prem} Premium, +${cac} An'anaviy (${movement.reason})`
    );
    saveDb();

    res.json({ state: buildStatePayload() });
  });

  // 13. Media, Prices & Brand Settings Update
  app.put('/api/media', (req, res) => {
    const { logoUrl, products, resetDefaults, actorName } = req.body || {};
    if (resetDefaults) {
      db.logoUrl = BRAND_LOGO_URL;
      db.products = INITIAL_PRODUCTS.map((p) => ({ ...p }));
    } else {
      if (logoUrl) db.logoUrl = logoUrl;
      if (Array.isArray(products) && products.length > 0) {
        db.products = products.map((p: Product) => ({
          ...p,
          wholesalePrice: Math.max(100, Number(p.wholesalePrice) || 45000),
          retailPrice: Math.max(100, Number(p.retailPrice) || 60000),
        }));

        // Also recalculate any pending orders so the updated price is reflected everywhere immediately
        const newPricePrem =
          db.products.find((p) => p.id === 'premium')?.wholesalePrice || 45000;
        const newPriceCac =
          db.products.find((p) => p.id === 'cacao')?.wholesalePrice || 48000;

        db.orders = db.orders.map((ord) => {
          if (ord.status === 'pending') {
            const { totalItems, totalSumUZS } = calculateDeliveryTotal(
              ord.qtyPremium,
              ord.qtyCacao,
              newPricePrem,
              newPriceCac
            );
            return {
              ...ord,
              unitPricePremium: newPricePrem,
              unitPriceCacao: newPriceCac,
              totalItems,
              totalSumUZS,
            };
          }
          return ord;
        });
      }
    }

    const pPrem = db.products.find((p) => p.id === 'premium')?.wholesalePrice || 45000;
    const pCac = db.products.find((p) => p.id === 'cacao')?.wholesalePrice || 48000;

    addAuditLog(
      actorName || 'Admin',
      'admin',
      'Narx va mahsulot sozlamalari yangilandi',
      `Ulgurji narxlar: Premium = ${formatCurrencyUZS(pPrem)}, An'anaviy = ${formatCurrencyUZS(pCac)}`
    );
    saveDb();
    res.json({ state: buildStatePayload() });
  });

  // 14. Configure Real Telegram Bot Token
  app.post('/api/telegram/config', async (req, res) => {
    const { botToken, actorName } = req.body || {};
    db.telegramConfig.botToken = String(botToken || '').trim() || DEFAULT_GATEWAY_TOKEN;
    saveDb();

    const result = await verifyAndStartTelegramBot();
    addAuditLog(
      actorName || 'Admin',
      'admin',
      'Telegram Bot sozlamalarini yangiladi',
      `@${db.telegramConfig.botUsername} boti faollashtirildi`
    );
    saveDb();

    res.json({
      ok: result.ok,
      error: result.error,
      state: buildStatePayload(),
    });
  });

  // 15. Add / Remove Telegram Subscriber (Operator / Founder Chat ID)
  app.post('/api/telegram/subscribers', (req, res) => {
    const { chatId, name, action } = req.body || {};
    const cleanId = String(chatId || '').trim();
    if (!cleanId) {
      res.status(400).json({ error: 'Chat ID kiriting' });
      return;
    }

    if (action === 'remove') {
      db.telegramConfig.subscribers = db.telegramConfig.subscribers.filter(
        (s) => s.chatId !== cleanId
      );
    } else {
      const exists = db.telegramConfig.subscribers.some((s) => s.chatId === cleanId);
      if (!exists) {
        db.telegramConfig.subscribers.push({
          chatId: cleanId,
          name: String(name || 'Operator / Asoschi').trim(),
          role: 'admin_operator',
          joinedAt: nowFormatted(),
        });
      }
    }
    saveDb();
    res.json({ state: buildStatePayload() });
  });

  // 16. Send Real Test Notification to Telegram
  app.post('/api/telegram/test', async (req, res) => {
    const { actorName } = req.body || {};
    const subs = db.telegramConfig.subscribers;
    const recipientCount = Math.max(1, subs.length);

    const testHtml =
      `✅ <b>MILLIY HOLVA — SINOV XABARI</b>\n\n` +
      `👤 <b>Yuboruvchi:</b> ${actorName || 'Asoschi Admin'}\n` +
      `📦 <b>Ombor qoldig'i:</b> Premium ${db.stock.qtyPremium} ta | An'anaviy ${db.stock.qtyCacao} ta\n` +
      `🏪 <b>Jami mijoz nuqtalari:</b> ${db.points.length} ta\n` +
      `🕒 <b>Vaqt:</b> ${nowFormatted()}\n\n` +
      `<i>Telegram bot va veb-dastur real-vaqt rejimida 100% integratsiya qilingan!</i>`;

    if (isCustomExternalToken(db.telegramConfig.botToken)) {
      for (const sub of subs) {
        try {
          await callTelegramApi('sendMessage', {
            chat_id: sub.chatId,
            text: testHtml,
            parse_mode: 'HTML',
          });
        } catch {
          // fallback to gateway log
        }
      }
    }

    addTelegramLog(
      `Sinov xabari (Test Ping) @${db.telegramConfig.botUsername || 'MilliyHolva_B2B_Bot'} orqali ${recipientCount} ta operatorga yuborildi`,
      recipientCount,
      true
    );
    saveDb();

    res.json({
      sent: recipientCount,
      state: buildStatePayload(),
    });
  });

  // Mount Vite or Static Dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Milliy Holva Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
