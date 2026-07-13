import 'dotenv/config'
import { Telegraf, Markup } from 'telegraf'
import ratelimit from 'telegraf-ratelimit'
import { MyContext } from './bot/context.js'
import { prisma } from './db/prisma.js'
import { adminKeyboard } from './bot/keyboards/admin.keyboard.js'
import { registerPaymentHandlers } from './bot/handlers/payment.handler.js'

import { sendInvoice } from './services/payments.js'
import { logger } from './utils/logger.js'
import { formatTariffs } from './utils/formatters.js'
import { setupQueues } from './services/queue.js'
import { redisSession } from './bot/middlewares/redis-session.js'
import { userLoader } from './bot/middlewares/user-loader.js'
import { i18n } from './services/i18n.js'
import { currencyService } from './services/currency.js'
import { PAYMENT_PROVIDERS } from './config/payments.config.js'
import { setupDefaultCommands, setupUserCommands } from './bot/commands.js'
import { grantChannelAccess } from './services/channel.js'
import express from 'express'
import { handleCryptoPayWebhook } from './bot/handlers/cryptopay.handler.js'
import { cryptoPayService } from './services/cryptopay.js'

import {
    handleAdminStats,
    handleAdminBroadcast,
    captureBroadcastContent,
    handleBroadcastConfirm,
    handleBroadcastCancel,
    handleBroadcastSkipFollowup,
    handleAdminExportUser,
    handleAdminGrant,
    handleAdminABStats,
    handleAdminABList,
    handleAdminABEdit,
    handleAdminABToggle,
    handleAdminABSetDefault,
    handleAdminABDelete,
    handleAdminABPriceSelect,
    handleAdminABAskParam,
    handleAdminABAskNewGroup,
    handleAdminMessage,
    isAdmin,
} from './bot/handlers/admin.handler.js'

const token = process.env.TELEGRAM_TOKEN

if (!token) {
    throw new Error('TELEGRAM_TOKEN is not defined in .env')
}

const bot = new Telegraf<MyContext>(token)

// Express setup for webhooks
const app = express()

// Middleware to capture rawBody for CryptoPay signature verification
app.use('/webhooks/cryptopay', express.raw({ type: 'application/json' }), (req: any, res, next) => {
    req.rawBody = req.body
    try {
        req.body = JSON.parse(req.body.toString())
    } catch (e) {
        // Fallback for invalid JSON
    }
    next()
})

app.post('/webhooks/cryptopay', (req, res) => handleCryptoPayWebhook(req, res, bot))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    logger.info(`Express server running on port ${PORT}`)
})

// Anti-DDoS / Rate Limiting
const limitConfig = {
    window: 1000,
    limit: 5,
    keyGenerator: (ctx: MyContext) => ctx.from?.id.toString() || 'unknown',
    onLimitExceeded: (ctx: MyContext) => {
        logger.warn(`Rate limit exceeded for user ${ctx.from?.id || 'unknown'}`)
    },
}

bot.use(ratelimit(limitConfig))

// Middlewares
bot.use(redisSession())
bot.use(userLoader())

// Register payment handlers (Boosty, Tribute, channel membership observer)
registerPaymentHandlers(bot)

// Initialize broadcast queue/worker
setupQueues(bot.telegram)

const DEFAULT_CONFIG = {
    price: 1999,
    oldPrice: 2999,
    priceCrypto: 26,
    priceStars: 2000,
    price3: 2999,
    oldPrice3: 4499,
    price3Crypto: 39,
    price3Stars: 3000,
    price6: 3499,
    oldPrice6: 5999,
    price6Crypto: 45,
    price6Stars: 3500,
}

/**
 * Показывает тарифные планы (1/3/6 месяцев) с кнопками выбора срока.
 */
async function showTariffs(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    const config = ctx.abConfig || DEFAULT_CONFIG

    await ctx.reply(formatTariffs(config, lang), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [
                {
                    ...Markup.button.callback(`💳 ${i18n.t(lang, 'messages.tariff_1m')}`, 'pay:1m'),
                    style: 'success',
                } as any,
                {
                    ...Markup.button.callback(`🔥 ${i18n.t(lang, 'messages.tariff_3m')}`, 'pay:3m'),
                    style: 'success',
                } as any,
            ],
            [
                {
                    ...Markup.button.callback(`💎 ${i18n.t(lang, 'messages.tariff_6m')}`, 'pay:6m'),
                    style: 'success',
                } as any,
            ],
        ]),
    })
}

/**
 * Показывает текстовое описание способов оплаты и кнопки выбора метода
 * для выбранного срока подписки (полностью как в основном боте).
 */
async function triggerInvoiceMenu(ctx: MyContext, days: number = 30) {
    const config = ctx.abConfig || DEFAULT_CONFIG
    const lang = ctx.language || 'ru'
    let priceRUB = config.price

    if (days === 90) {
        priceRUB = config.price3
    } else if (days === 180) {
        priceRUB = config.price6
    }

    const buttons: any[] = []

    // 1. Boosty (Observer Bot Pattern)
    buttons.push([
        Markup.button.callback(`🌍 Boosty (оплата из большинства стран мира)`, `pay:boosty`),
    ])

    // 2. Manual Payment
    buttons.push([
        Markup.button.callback(`${i18n.t(lang, 'buttons.manual_payment')}`, `pay:manual:${days}`),
    ])

    // 3. Tribute (Observer Bot Pattern) — показываем только если задана ссылка
    if (process.env.TRIBUTE_URL) {
        buttons.push([Markup.button.callback(`💳 Tribute (карты всего мира)`, `pay:tribute`)])
    }

    // 4. Crypto Pay
    const cryptoProvider = PAYMENT_PROVIDERS['crypto_pay']
    if (cryptoProvider && cryptoProvider.token) {
        buttons.push([
            {
                text: cryptoProvider.label,
                callback_data: `pay:provider:crypto_pay:${days}`,
                icon_custom_emoji_id: '6145689384113934206',
            } as any,
        ])
    }

    // 5. Telegram Stars
    const starsProvider = PAYMENT_PROVIDERS['telegram_stars']
    if (starsProvider) {
        buttons.push([
            Markup.button.callback(
                `⭐️ ${starsProvider.label}`,
                `pay:provider:telegram_stars:${days}`,
            ),
        ])
    }

    // 6. Other Providers (Sequential)
    const otherProviders = Object.values(PAYMENT_PROVIDERS).filter((p) => {
        if (p.id === 'yookassa' && !process.env.YOOKASSA_TOKEN) {
            return false
        }
        return (
            p.id !== 'telegram_stars' &&
            p.id !== 'crypto_pay' &&
            p.id !== 'tribute' &&
            !!p.token
        )
    })

    for (const p of otherProviders) {
        const amount = await currencyService.convertFromRUB(priceRUB, p.currency)
        const label = `${p.flag} ${p.label} (${amount} ${p.currency})`
        buttons.push([Markup.button.callback(label, `pay:provider:${p.id}:${days}`)])
    }

    if (buttons.length === 0) {
        return ctx.reply(i18n.t(lang, 'messages.no_payment_methods'))
    }

    const title =
        days === 180
            ? i18n.t(lang, 'messages.tariff_6m')
            : days === 90
              ? i18n.t(lang, 'messages.tariff_3m')
              : i18n.t(lang, 'messages.tariff_1m')

    await ctx.reply(
        i18n.t(lang, 'messages.payment_choice_for_period', {
            title,
            methods: i18n.t(lang, 'messages.payment_choice_title'),
        }),
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons),
        },
    )
}

// /start
bot.start(async (ctx) => {
    const user = ctx.user!
    const first_name = ctx.from?.first_name || ''
    const lang = ctx.language || 'ru'

    try {
        await setupUserCommands(ctx.telegram, ctx.from!.id, isAdmin(ctx))

        if (isAdmin(ctx)) {
            await ctx.reply(i18n.t(lang, 'messages.welcome_back', { name: first_name }), adminKeyboard)
        }

        // Активная подписка по дате?
        if (user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
            await ctx.reply(
                i18n.t(lang, 'messages.subscription_active', {
                    expiry: user.subscriptionExpiry.toLocaleDateString('ru-RU'),
                }),
                { parse_mode: 'HTML' },
            )
        } else {
            await ctx.reply(i18n.t(lang, 'messages.welcome'), { parse_mode: 'HTML' })
        }

        await showTariffs(ctx)
    } catch (error) {
        logger.error('Error in /start:', error)
        await ctx.reply('Извините, произошла ошибка. Попробуйте /start еще раз.')
    }
})

// /buy
bot.command('buy', async (ctx) => {
    await showTariffs(ctx)
})

// /menu
bot.command('menu', async (ctx) => {
    const lang = ctx.language || 'ru'
    if (isAdmin(ctx)) {
        return ctx.reply(i18n.t(lang, 'buttons.back_to_menu'), adminKeyboard)
    }
    await showTariffs(ctx)
})

// /status — состояние подписки
async function handleStatus(ctx: MyContext) {
    const lang = ctx.language || 'ru'
    const user = ctx.user
    if (!user) return

    if (user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
        return ctx.reply(
            i18n.t(lang, 'messages.status_active', {
                expiry: user.subscriptionExpiry.toLocaleDateString('ru-RU'),
            }),
            { parse_mode: 'HTML' },
        )
    }
    if (user.paid) {
        return ctx.reply(i18n.t(lang, 'messages.status_paid_no_expiry'), { parse_mode: 'HTML' })
    }
    return ctx.reply(i18n.t(lang, 'messages.status_inactive'), { parse_mode: 'HTML' })
}

bot.command('status', handleStatus)

// Выбор срока подписки → меню способов оплаты
bot.action('pay:1m', async (ctx) => {
    await ctx.answerCbQuery()
    await triggerInvoiceMenu(ctx, 30)
})

bot.action('pay:3m', async (ctx) => {
    await ctx.answerCbQuery()
    await triggerInvoiceMenu(ctx, 90)
})

bot.action('pay:6m', async (ctx) => {
    await ctx.answerCbQuery()
    await triggerInvoiceMenu(ctx, 180)
})

// Ручная оплата
bot.action(/^pay:manual:(\d+)$/, async (ctx) => {
    const days = ctx.match[1]
    const lang = ctx.language || 'ru'
    const manager = process.env.MANUAL_PAYMENT_MANAGER || '@admin_username'
    const text = i18n.t(lang, `messages.manual_payment_info_${days}`, { manager })

    await ctx.answerCbQuery()
    await ctx.reply(text, { parse_mode: 'HTML' })
})

// Crypto Pay / Telegram Stars / прочие провайдеры — сразу создаём счёт
bot.action(/^pay:provider:(.+):(\d+)$/, async (ctx) => {
    const providerId = ctx.match[1]
    const days = parseInt(ctx.match[2])
    const provider = PAYMENT_PROVIDERS[providerId]
    const config = ctx.abConfig || DEFAULT_CONFIG
    let priceRUB = config.price
    if (days === 90) priceRUB = config.price3
    else if (days === 180) priceRUB = config.price6

    await ctx.answerCbQuery(`Генерируем счет...`)

    try {
        if (providerId === 'crypto_pay') {
            let amountUSDT = config.priceCrypto
            if (days === 90) amountUSDT = config.price3Crypto
            else if (days === 180) amountUSDT = config.price6Crypto

            const invoice = await cryptoPayService.createInvoice({
                userId: ctx.user!.id,
                amount: amountUSDT.toString(),
                currency: 'USDT',
                days: days,
            })
            return ctx.reply(i18n.t(ctx.language || 'ru', 'messages.crypto_pay_invoice'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Оплатить криптой',
                                url: invoice.bot_invoice_url,
                                style: 'success',
                            } as any,
                        ],
                    ],
                },
            })
        }

        let minorUnits = 0
        if (providerId === 'telegram_stars') {
            const starsPrice =
                days === 180
                    ? config.price6Stars
                    : days === 90
                      ? config.price3Stars
                      : config.priceStars
            minorUnits = starsPrice
        } else {
            const amountConverted = await currencyService.convertFromRUB(priceRUB, provider.currency)
            minorUnits = Math.round(amountConverted * 100)
        }

        await sendInvoice(
            ctx,
            {
                title: `Подписка: ${days} дней`,
                description: 'Доступ в закрытый канал с контентом.',
                amount: minorUnits,
                currency: provider.currency,
                days: days,
            },
            providerId,
        )
    } catch (error) {
        logger.error('Error in pay:provider action:', error)
        await ctx.reply('Извините, произошла ошибка при создании счета.')
    }
})

// Заявка на вступление в канал — одобряем оплативших
bot.on('chat_join_request', async (ctx) => {
    const userId = ctx.chatJoinRequest.from.id
    const chatId = ctx.chatJoinRequest.chat.id

    try {
        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(userId) },
        })

        if (user && user.paid) {
            await ctx.telegram.approveChatJoinRequest(chatId, userId)
            await bot.telegram.sendMessage(userId, '✅ Ваша заявка одобрена! Доступ открыт.')
        } else {
            await ctx.telegram.declineChatJoinRequest(chatId, userId)
            await bot.telegram.sendMessage(
                userId,
                '❌ Для вступления необходимо оплатить подписку в боте. Отправьте /buy.',
            )
        }
    } catch (error) {
        logger.error('Ошибка в обработчике chat_join_request:', error)
    }
})

// --- Admin ---
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) return
    await ctx.reply('Админ-панель', adminKeyboard)
})

bot.command('stats', handleAdminStats)
bot.command('broadcast', handleAdminBroadcast)
bot.command('export_user', handleAdminExportUser)
bot.command('admin_grant', handleAdminGrant)
bot.command('ab_stats', handleAdminABStats)

// Cancel: clears any pending admin/broadcast flow
bot.command('cancel', async (ctx) => {
    const lang = ctx.language || 'ru'
    delete ctx.session.broadcastState
    delete ctx.session.adminState
    if (isAdmin(ctx)) {
        return ctx.reply(i18n.t(lang, 'buttons.back_to_menu'), adminKeyboard)
    }
    await ctx.reply(i18n.t(lang, 'buttons.back_to_menu'))
})

// Capture media (photo/video/circle/document/…) sent by an admin who is
// composing a broadcast.
bot.on(
    ['photo', 'video', 'video_note', 'document', 'voice', 'audio', 'animation', 'sticker'],
    async (ctx, next) => {
        const handled = await captureBroadcastContent(ctx)
        if (handled) return
        return next()
    },
)

// Admin reply-keyboard buttons
bot.hears([/📊 (Общая статистика|Статистика)/], handleAdminStats)
bot.hears([/🏷 A\/B Тесты/], handleAdminABList)
bot.hears([/📢 (Массовая рассылка|Рассылка)/], handleAdminBroadcast)
bot.hears([/📥 Экспорт/], (ctx) => {
    if (!isAdmin(ctx)) return
    ctx.reply('/export_user <telegramId>')
})
bot.hears([/🏠 Главное меню/], async (ctx) => {
    const lang = ctx.language || 'ru'
    if (isAdmin(ctx)) {
        return ctx.reply(i18n.t(lang, 'buttons.back_to_menu'), adminKeyboard)
    }
    await showTariffs(ctx)
})

// Dynamic A/B Action Handlers
bot.action('admin:main', async (ctx) => {
    await ctx.answerCbQuery()
    await ctx.reply('Админ панель:', adminKeyboard)
})

bot.action('admin:ab:list', async (ctx) => {
    await ctx.answerCbQuery()
    await handleAdminABList(ctx)
})

bot.action(/^admin:ab:edit:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    await handleAdminABEdit(ctx, ctx.match[1])
})

bot.action(/^admin:ab:toggle:(.+)$/, async (ctx) => {
    await handleAdminABToggle(ctx, ctx.match[1])
})

bot.action(/^admin:ab:default:(.+)$/, async (ctx) => {
    await handleAdminABSetDefault(ctx, ctx.match[1])
})

bot.action(/^admin:ab:delete:(.+)$/, async (ctx) => {
    await handleAdminABDelete(ctx, ctx.match[1])
})

bot.action(/^admin:ab:price_select:(.+)$/, async (ctx) => {
    await handleAdminABPriceSelect(ctx, ctx.match[1])
})

bot.action(/^admin:ab:param:(.+):(.+)$/, async (ctx) => {
    await handleAdminABAskParam(ctx, ctx.match[1], ctx.match[2])
})

bot.action('admin:ab:create', async (ctx) => {
    await handleAdminABAskNewGroup(ctx)
})

// Broadcast confirmation
bot.action('broadcast:confirm', handleBroadcastConfirm)
bot.action('broadcast:cancel', handleBroadcastCancel)
bot.action('broadcast:skip_followup', handleBroadcastSkipFollowup)

// Generic text handler for admin inputs
bot.on('text', async (ctx, next) => {
    const text = ctx.message.text

    // Admin multi-step input (A/B price editing, new group)
    const adminHandled = await handleAdminMessage(ctx, text)
    if (adminHandled) return

    // Broadcast content being composed by an admin
    const broadcastHandled = await captureBroadcastContent(ctx)
    if (broadcastHandled) return

    return next()
})

// Telegram Payment Pre-Checkout Query
bot.on('pre_checkout_query', async (ctx) => {
    const lang = ctx.language || 'ru'
    try {
        await ctx.answerPreCheckoutQuery(true)
    } catch (error) {
        logger.error('Error in pre_checkout_query:', error)
        await ctx.answerPreCheckoutQuery(false, i18n.t(lang, 'messages.global_error'))
    }
})

// Telegram Successful Payment (Stars и провайдеры Telegram Payments)
bot.on('successful_payment', async (ctx) => {
    const telegramId = BigInt(ctx.from?.id || 0)
    const lang = ctx.language || 'ru'

    try {
        const payload = ctx.message.successful_payment.invoice_payload
        logger.info(`Received successful_payment from ${telegramId}. Payload: ${payload}`)

        const parts = payload.split(':')
        const providerId = parts[2]
        const days = parseInt(parts[3]) || 30

        const user = await prisma.user.findUnique({ where: { telegramId } })

        let newExpiry = new Date()
        if (user?.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
            newExpiry = new Date(user.subscriptionExpiry.getTime() + days * 24 * 60 * 60 * 1000)
        } else {
            newExpiry = new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000)
        }

        await prisma.user.update({
            where: { telegramId },
            data: {
                paid: true,
                paymentDate: new Date(),
                subscriptionExpiry: newExpiry,
                lastPaymentProvider: providerId,
            },
        })

        logger.info(`Database updated for user ${telegramId}. Paid: true, Provider: ${providerId}`)

        // Выдаём доступ в канал (одноразовая инвайт-ссылка).
        await grantChannelAccess(bot.telegram, telegramId, newExpiry.toLocaleDateString('ru-RU'))
    } catch (error) {
        logger.error('Error in successful_payment hook:', error)
        await ctx.reply(i18n.t(lang, 'messages.global_error'))
    }
})

// Global error handling
bot.catch(async (err, ctx) => {
    logger.error(`Critical Telegraf error for update ${ctx.update.update_id}:`, err)
    try {
        await ctx
            .reply('⚠️ Произошла ошибка. Пожалуйста, введите /start для сброса.')
            .catch(() => {})
    } catch (e) {
        logger.error('Double fault in bot.catch:', e)
    }
})

// Handle process-level errors to prevent crashes
process.on('uncaughtException', (err) => logger.error('CRITICAL: Uncaught Exception:', err))
process.on('unhandledRejection', (reason, promise) =>
    logger.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason),
)

// Handle graceful shutdown
process.once('SIGINT', () => {
    logger.info('SIGINT received, stopping bot...')
    bot.stop('SIGINT')
})
process.once('SIGTERM', () => {
    logger.info('SIGTERM received, stopping bot...')
    bot.stop('SIGTERM')
})

bot.launch({
    dropPendingUpdates: true,
    allowedUpdates: [
        'message',
        'callback_query',
        'chat_member',
        'my_chat_member',
        'chat_join_request',
        'pre_checkout_query',
    ],
})
    .then(() => {
        logger.info('Бот запущен...')
        return setupDefaultCommands(bot.telegram)
    })
    .catch((err) => logger.error('Ошибка запуска бота:', err))
