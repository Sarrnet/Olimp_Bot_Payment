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

## 8. Запуск на одном сервере с основным ботом

Оба бота свободно живут на одном VPS — это независимые процессы с разными
токенами. Нужно только развести общие ресурсы (значения по умолчанию в
`.env.example` и `docker-compose.yml` уже настроены под это):

| Ресурс                  | Основной бот | Платёжный бот         |
| ----------------------- | ------------ | --------------------- |
| Порт Express (webhook)  | 3000         | **3001**              |
| Логический Redis-DB     | `/0`         | **`/1`**              |
| База данных             | `olimp_bot`  | **`olimp_bot_payment`** |
| Host-порт Postgres (Docker) | 5433     | **5434**              |

### Вариант A — Docker Compose (рекомендуется)

Запускайте каждый бот как отдельный compose-проект. Тогда у каждого свои
изолированные контейнеры Postgres и Redis, и конфликт по Redis-DB отпадает сам:

```bash
docker compose -p olimp_main    up -d   # в папке основного бота
docker compose -p olimp_payment up -d   # в папке платёжного бота
```

Наружу публикуются только разные host-порты: бот — `3001` (`HOST_PORT`),
Postgres — `5434` (`DB_HOST_PORT`). При необходимости переопределите их в `.env`.

### Вариант B — напрямую через Node (pm2/systemd)

Один общий Postgres и один общий Redis на сервере, у каждого бота свой `.env`:

- разные `DATABASE_URL` (базы `olimp_bot` и `olimp_bot_payment`);
- разные `REDIS_URL` — обязательно разные номера БД: `.../0` и `.../1`
  (иначе сессии и очередь рассылки перетрут друг друга);
- разные `PORT`: `3000` и `3001`.

```bash
pm2 start dist/index.js --name olimp-payment
```
