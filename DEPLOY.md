# Деплой

## 1. Требования

- Node.js 22+
- PostgreSQL 14+
- Redis 6+
- Токен бота от [@BotFather](https://t.me/BotFather)

## 2. Настройка Telegram

1. Создайте бота у @BotFather, получите `TELEGRAM_TOKEN`.
2. Создайте закрытый канал с контентом. Добавьте бота **администратором** с
   правом «Пригласительные ссылки» (`can_invite_users`).
3. Узнайте ID канала (например, переслав пост канала в @userinfobot или
   @getidsbot). Формат: `-1001234567890`. Впишите его в `PAID_CHANNEL_ID`.
4. Чтобы бот получал события `chat_member` (авто-выдача/отзыв доступа при
   вступлении/выходе), он должен быть администратором канала.

## 3. Переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

- `TELEGRAM_TOKEN`, `BOT_USERNAME`, `ADMIN_IDS`
- `PAID_CHANNEL_ID` — ID закрытого канала
- `MANUAL_PAYMENT_MANAGER` — @username менеджера для ручной оплаты
- `BOOSTY_URL`, `TRIBUTE_URL` — ссылки внешних сервисов (Tribute можно оставить
  пустым — тогда кнопка не показывается)
- `CRYPTO_PAY_TOKEN` — токен приложения из [@CryptoBot](https://t.me/CryptoBot)
- `DATABASE_URL`, `REDIS_URL`

Telegram Stars работают без токена провайдера.

## 4. Crypto Pay webhook

В настройках приложения Crypto Pay укажите webhook:

```
https://ВАШ_ДОМЕН/webhooks/cryptopay
```

Express слушает порт `PORT` (по умолчанию 3000).

## 5. Запуск через Docker Compose

```bash
docker compose up --build -d
```

Compose поднимает бота, PostgreSQL и Redis. Миграции применяются автоматически
через `start.sh` (`prisma migrate deploy`).

## 6. Запуск вручную

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
npm run build
npm start
```

Для разработки: `npm run dev`.

## 7. Проверка

- Отправьте `/start` боту — должно появиться меню тарифов.
- Проверьте `/admin` (для ID из `ADMIN_IDS`) — панель, статистика, A/B, рассылка.
- Тесты: `npm run test:run`.
