/**
 * JetMedia Investor Cabinet — front-end logic
 * ---------------------------------------------------------
 * Talks to the Google Apps Script Web App deployed from Code.gs.
 *
 * SETUP: paste your Apps Script deployment URL below.
 * It looks like:
 *   https://script.google.com/macros/s/AKfycb.../exec
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbynL60VyC6dE4BrpfGpi2rx2_0kH-uLlPGd9t40eMPpy2-D8apTnNQXjhCxHQDZz4o/exec';

// ------------------------------------------------------------------
// STATE
// ------------------------------------------------------------------
const state = {
  investorId: null,
  token: null,
  name: null,
  currentPage: 'home',
  devicesCache: null,
  currencySymbol: '$'
};

// ------------------------------------------------------------------
// TELEGRAM WEB APP INIT
// ------------------------------------------------------------------
(function initTelegram() {
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      tg.setHeaderColor && tg.setHeaderColor('#0B0E14');
      tg.setBackgroundColor && tg.setBackgroundColor('#0B0E14');
    }
  } catch (e) { /* not running inside Telegram, ignore */ }
})();

function getTelegramId() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    return user ? String(user.id) : '';
  } catch (e) {
    return '';
  }
}

// ------------------------------------------------------------------
// API HELPER
// ------------------------------------------------------------------
async function apiCall(action, extraParams) {
  if (!API_URL || API_URL.indexOf('PASTE_YOUR') === 0) {
    throw new Error('API_URL не настроен. Открой script.js и вставь ссылку на Apps Script deployment.');
  }

  const params = new URLSearchParams({ action, ...(extraParams || {}) });
  if (state.investorId && state.token) {
    params.set('investorId', state.investorId);
    params.set('token', state.token);
  }

  const res = await fetch(`${API_URL}?${params.toString()}`, { method: 'GET' });
  if (!res.ok) throw new Error('Ошибка сети: ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Неизвестная ошибка');
  return data;
}

// ------------------------------------------------------------------
// FORMATTING HELPERS
// ------------------------------------------------------------------
function money(n) {
  const v = Number(n) || 0;
  return state.currencySymbol + v.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

// ------------------------------------------------------------------
// SESSION (kept in memory only for this run — no browser storage)
// ------------------------------------------------------------------
function setSession(investorId, token, name) {
  state.investorId = investorId;
  state.token = token;
  state.name = name;
}

function clearSession() {
  state.investorId = null;
  state.token = null;
  state.name = null;
  state.devicesCache = null;
}

// ------------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------------
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

window.addEventListener('DOMContentLoaded', () => {
  const tgId = getTelegramId();
  if (tgId) document.getElementById('input-telegram-id').value = tgId;
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const telegramId = document.getElementById('input-telegram-id').value.trim();
  const password = document.getElementById('input-password').value.trim();

  setLoginLoading(true);
  try {
    const data = await apiCall('login', { telegramId, password });
    setSession(data.investorId, data.token, data.name);
    enterApp();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  } finally {
    setLoginLoading(false);
  }
});

function setLoginLoading(isLoading) {
  btnLogin.disabled = isLoading;
  btnLogin.querySelector('.btn-label').hidden = isLoading;
  btnLogin.querySelector('.btn-spinner').hidden = !isLoading;
}

function enterApp() {
  document.getElementById('screen-login').classList.remove('is-active');
  document.getElementById('app').hidden = false;
  navigateTo('home');
  loadHome();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  clearSession();
  document.getElementById('app').hidden = true;
  document.getElementById('screen-login').classList.add('is-active');
  document.getElementById('input-password').value = '';
});

// ------------------------------------------------------------------
// NAVIGATION
// ------------------------------------------------------------------
const pageTitles = {
  home: 'Портфель',
  devices: 'Мои устройства',
  'device-detail': 'Устройство',
  income: 'Доходность',
  withdrawals: 'История выплат',
  offers: 'Купить ещё',
  news: 'Новости',
  support: 'Поддержка',
  profile: 'Профиль'
};

document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => navigateTo(el.dataset.nav));
});

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => { p.hidden = p.dataset.page !== page; });
  document.getElementById('topbar-title').textContent = pageTitles[page] || 'JetMedia';

  document.querySelectorAll('.tab-item').forEach(t => {
    t.classList.toggle('is-active', t.dataset.nav === page);
  });

  if (page === 'devices') loadDevices();
  if (page === 'income') loadIncome();
  if (page === 'withdrawals') loadWithdrawals();
  if (page === 'offers') loadOffers();
  if (page === 'news') loadNews();
  if (page === 'profile') loadProfile();

  window.scrollTo(0, 0);
}

document.getElementById('btn-refresh').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.classList.add('is-spinning');
  try {
    await loadHome();
    if (state.currentPage === 'devices') await loadDevices(true);
    showToast('Данные обновлены');
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.classList.remove('is-spinning');
  }
});

// ------------------------------------------------------------------
// HOME / PORTFOLIO
// ------------------------------------------------------------------
async function loadHome() {
  try {
    const data = await apiCall('getPortfolio');
    document.getElementById('stat-portfolio-value').textContent = money(data.portfolioValue);
    document.getElementById('stat-device-count').textContent = data.deviceCount;
    document.getElementById('stat-income-month').textContent = money(data.incomeThisMonth);
    document.getElementById('stat-income-total').textContent = money(data.incomeAllTime);
    document.getElementById('stat-available').textContent = money(data.availableToWithdraw);
    document.getElementById('stat-roi-pill').textContent = `ROI ${data.roi}%`;
  } catch (err) {
    showToast(err.message);
  }
}

// ------------------------------------------------------------------
// DEVICES LIST
// ------------------------------------------------------------------
async function loadDevices(force) {
  const container = document.getElementById('devices-list');
  if (state.devicesCache && !force) {
    renderDevices(state.devicesCache);
    return;
  }
  container.innerHTML = '<div class="skeleton-list"></div>';
  try {
    const data = await apiCall('getDevices');
    state.devicesCache = data.devices;
    renderDevices(data.devices);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon">!</div>${escapeHtml(err.message)}</div>`;
  }
}

function renderDevices(devices) {
  const container = document.getElementById('devices-list');
  if (!devices.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">▣</div>Пока нет устройств в портфеле</div>';
    return;
  }

  container.innerHTML = devices.map((d, idx) => {
    const isOnline = /работает|online|active/i.test(d.status);
    const statusClass = isOnline ? 'ticker-status--online' : 'ticker-status--offline';
    const spark = renderMiniSparkline(d.trend);

    return `
      <div class="ticker-row" data-device-idx="${idx}" role="button" tabindex="0">
        <span class="ticker-status ${statusClass}"></span>
        <div class="ticker-main">
          <div class="ticker-name">${escapeHtml(d.restaurantName)}</div>
          <div class="ticker-meta">
            <span>№${escapeHtml(d.serialNumber)}</span>
            <span>·</span>
            <span>${escapeHtml(d.lastActivity)}</span>
          </div>
        </div>
        <div class="ticker-right">
          ${spark}
          <span class="ticker-income">+${money(d.monthIncome)}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-device-idx]').forEach(row => {
    const open = () => openDeviceDetail(devices[Number(row.dataset.deviceIdx)]);
    row.addEventListener('click', open);
    row.addEventListener('keypress', (e) => { if (e.key === 'Enter') open(); });
  });
}

function renderMiniSparkline(trend) {
  if (!trend || !trend.length) return '';
  const max = Math.max(...trend, 0.01);
  const bars = trend.map((v, i) => {
    const h = Math.max(2, Math.round((v / max) * 24));
    const cls = i === trend.length - 1 ? 'bar is-last' : 'bar';
    return `<span class="${cls}" style="height:${h}px"></span>`;
  }).join('');
  return `<span class="ticker-sparkline">${bars}</span>`;
}

// ------------------------------------------------------------------
// DEVICE DETAIL
// ------------------------------------------------------------------
function openDeviceDetail(device) {
  const container = document.getElementById('device-detail-content');
  const isOnline = /работает|online|active/i.test(device.status);

  const max = Math.max(...(device.trend || [0]), 0.01);
  const sparkBars = (device.trend || []).map((v, i) => {
    const h = Math.max(4, Math.round((v / max) * 100));
    const cls = i === device.trend.length - 1 ? 'bar is-last' : 'bar';
    return `<div class="${cls}" style="height:${h}%" title="${money(v)}"></div>`;
  }).join('');

  container.innerHTML = `
    <button class="detail-back" id="detail-back-btn">← Назад</button>
    <div class="detail-hero">
      <div class="detail-hero__top">
        <div>
          <div class="detail-hero__name">${escapeHtml(device.restaurantName)}</div>
          <div class="detail-hero__serial">№${escapeHtml(device.serialNumber)}</div>
        </div>
        <span class="ticker-status ${isOnline ? 'ticker-status--online' : 'ticker-status--offline'}"></span>
      </div>
      <div class="detail-hero__address">${escapeHtml(device.restaurantAddress || 'Адрес не указан')}</div>
    </div>

    <div class="detail-grid">
      <div class="stat-card">
        <div class="stat-card__label">Доход за месяц</div>
        <div class="stat-card__value stat-card__value--accent">${money(device.monthIncome)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Просмотров рекламы</div>
        <div class="stat-card__value">${Number(device.monthViews).toLocaleString('ru-RU')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Дата установки</div>
        <div class="stat-card__value" style="font-size:15px">${escapeHtml(device.installDate)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Статус</div>
        <div class="stat-card__value" style="font-size:15px">${escapeHtml(device.status)}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Динамика за 6 месяцев</div>
      <div class="detail-sparkline">${sparkBars}</div>
    </div>
  `;

  document.getElementById('detail-back-btn').addEventListener('click', () => navigateTo('devices'));

  document.querySelectorAll('.page').forEach(p => { p.hidden = p.dataset.page !== 'device-detail'; });
  document.getElementById('topbar-title').textContent = pageTitles['device-detail'];
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('is-active'));
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------
// INCOME / ДОХОДНОСТЬ
// ------------------------------------------------------------------
async function loadIncome() {
  const container = document.getElementById('income-bars');
  container.innerHTML = '<div class="skeleton-list"></div>';
  try {
    const data = await apiCall('getIncomeHistory');
    renderIncome(data.months, data.values);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderIncome(months, values) {
  const container = document.getElementById('income-bars');
  const max = Math.max(...values, 0.01);

  const rows = months.map((m, i) => ({ month: m, value: values[i] })).reverse();

  container.innerHTML = rows.map(r => `
    <div class="bar-row">
      <span class="bar-row__month">${escapeHtml(r.month)}</span>
      <span class="bar-row__track"><span class="bar-row__fill" style="width:${Math.max(3, (r.value / max) * 100)}%"></span></span>
      <span class="bar-row__value">${money(r.value)}</span>
    </div>
  `).join('');
}

// ------------------------------------------------------------------
// WITHDRAWALS
// ------------------------------------------------------------------
async function loadWithdrawals() {
  const container = document.getElementById('withdrawals-list');
  container.innerHTML = '<div class="skeleton-list"></div>';
  try {
    const data = await apiCall('getWithdrawals');
    renderWithdrawals(data.withdrawals);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderWithdrawals(list) {
  const container = document.getElementById('withdrawals-list');
  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">↧</div>Выводов ещё не было</div>';
    return;
  }
  container.innerHTML = list.map(w => {
    const isDone = /исполнено|done|completed/i.test(w.status);
    return `
      <div class="tx-row">
        <span class="tx-row__date">${escapeHtml(w.date)}</span>
        <span class="tx-row__amount">${money(w.amount)}</span>
        <span class="tx-row__status ${isDone ? 'tx-row__status--done' : 'tx-row__status--pending'}">${escapeHtml(w.status)}</span>
      </div>
    `;
  }).join('');
}

document.getElementById('btn-request-withdrawal').addEventListener('click', async () => {
  try {
    const portfolio = await apiCall('getPortfolio');
    const amount = portfolio.availableToWithdraw;
    if (!amount || amount <= 0) {
      showToast('Нет доступных средств для вывода');
      return;
    }
    await apiCall('requestWithdrawal', { amount });
    showToast('Запрос на вывод отправлен');
    loadWithdrawals();
    loadHome();
  } catch (err) {
    showToast(err.message);
  }
});

// ------------------------------------------------------------------
// OFFERS / КУПИТЬ ЕЩЁ
// ------------------------------------------------------------------
async function loadOffers() {
  const container = document.getElementById('offers-list');
  container.innerHTML = '<div class="skeleton-list"></div>';
  try {
    const data = await apiCall('getOffers');
    renderOffers(data.offers);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderOffers(offers) {
  const container = document.getElementById('offers-list');
  if (!offers.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">＋</div>Тарифы скоро появятся</div>';
    return;
  }

  container.innerHTML = offers.map(o => {
    const featured = o.discount >= 10;
    const slotsPct = o.slotsTotal > 0 ? Math.min(100, (o.slotsLeft / o.slotsTotal) * 100) : 0;
    return `
      <div class="offer-card ${featured ? 'is-featured' : ''}">
        ${o.discount ? `<span class="offer-card__badge">Скидка ${o.discount}%</span>` : ''}
        <div class="offer-card__name">${escapeHtml(o.package)}</div>
        <div class="offer-card__devices">${o.deviceCount} устройств</div>
        <div class="offer-card__price">${money(o.price)}</div>
        <div class="offer-card__desc">${escapeHtml(o.description || '')}</div>
        ${o.slotsTotal ? `
          <div class="offer-card__slots">
            Свободно: ${o.slotsLeft} из ${o.slotsTotal}
            <div class="offer-card__slots-track"><div class="offer-card__slots-fill" style="width:${slotsPct}%"></div></div>
          </div>
        ` : ''}
        <button class="btn btn--primary btn--block" data-offer="${escapeHtml(o.package)}">Купить</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-offer]').forEach(btn => {
    btn.addEventListener('click', () => {
      const linkEl = document.querySelector('.support-link[href^="https://t.me"]');
      const link = linkEl ? linkEl.getAttribute('href') : '#';
      showToast('Свяжитесь с менеджером для оформления покупки');
      window.open(link, '_blank');
    });
  });
}

// ------------------------------------------------------------------
// NEWS
// ------------------------------------------------------------------
async function loadNews() {
  const container = document.getElementById('news-list');
  container.innerHTML = '<div class="skeleton-list"></div>';
  try {
    const data = await apiCall('getNews');
    renderNews(data.news);
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderNews(news) {
  const container = document.getElementById('news-list');
  if (!news.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">✦</div>Пока новостей нет</div>';
    return;
  }
  container.innerHTML = news.map(n => `
    <div class="news-item">
      <div class="news-item__date">${escapeHtml(n.date)}</div>
      <div class="news-item__title">${escapeHtml(n.title)}</div>
      <div class="news-item__text">${escapeHtml(n.text)}</div>
    </div>
  `).join('');
}

// ------------------------------------------------------------------
// PROFILE
// ------------------------------------------------------------------
async function loadProfile() {
  document.getElementById('profile-name').textContent = state.name || '—';
  document.getElementById('profile-id').textContent = `Investor ID ${state.investorId || '—'}`;
  document.getElementById('profile-avatar').textContent = (state.name || '?').trim().charAt(0).toUpperCase();

  try {
    const data = await apiCall('getPortfolio');
    document.getElementById('profile-device-count').textContent = data.deviceCount;
  } catch (err) {
    showToast(err.message);
  }
}

document.getElementById('change-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('change-password-msg');
  msg.hidden = true;
  const newPassword = document.getElementById('input-new-password').value.trim();

  try {
    await apiCall('changePassword', { newPassword });
    showToast('Пароль обновлён');
    document.getElementById('input-new-password').value = '';
  } catch (err) {
    msg.textContent = err.message;
    msg.hidden = false;
  }
});

// ------------------------------------------------------------------
// UTIL
// ------------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
