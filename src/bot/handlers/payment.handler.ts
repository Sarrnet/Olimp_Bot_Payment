import { Telegraf, Markup } from 'telegraf'
import { MyContext } from '../context.js'
import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'

/**
 * Регистрация обработчиков оплаты через внешние сервисы (Boosty, Tribute) и
 * наблюдателя за вступлением/выходом из закрытого канала.
 */
export function registerPaymentHandlers(bot: Telegraf<MyContext>) {
    // 1. Boosty — промежуточный шаг с предупреждением
    bot.action(/^pay:boosty$/, async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {})

            const warningMessage =
                '⚠️ <b>ОЧЕНЬ ВАЖНО!!!</b>\n\n' +
                'Оплачивайте подписку через браузерную версию, приложение на айфон часто увеличивает цену в несколько раз.\n\n' +
                'Выдача происходит автоматически.'

            await ctx.reply(warningMessage, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('Понятно, перейти к оплате', 'pay:boosty:confirm')],
                ]),
            })
        } catch (error) {
            logger.error('Error in pay:boosty warning action:', error)
            await ctx.reply('Извините, произошла ошибка.')
        }
    })

    // 2. Boosty — подтверждение и выдача ссылки
    bot.action('pay:boosty:confirm', async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {})

            const boostyUrl = process.env.BOOSTY_URL || 'https://boosty.to/YOUR_PAGE'

            const message =
                '🌍 <b>Оплата через Boosty</b>\n\n' +
                '1. Перейдите на нашу страницу Boosty по кнопке ниже и оформите подписку.\n\n' +
                '2. После оплаты Boosty предложит вам привязать Telegram и добавит в наш закрытый VIP-канал.\n\n' +
                '3. <b>Как только вы вступите в канал, этот бот автоматически активирует ваш полный доступ!</b>'

            await ctx.reply(message, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.url('Перейти на Boosty', boostyUrl)]]),
            })
        } catch (error) {
            logger.error('Error in pay:boosty:confirm action:', error)
            await ctx.reply('Извините, произошла ошибка при подготовке ссылки на Boosty.')
        }
    })

    // 3. Tribute — промежуточный шаг с предупреждением (как у Boosty)
    bot.action(/^pay:tribute$/, async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {})

            const warningMessage =
                '⚠️ <b>ОЧЕНЬ ВАЖНО!!!</b>\n\n' +
                'Оплачивайте подписку через браузерную версию, приложение на айфон часто увеличивает цену в несколько раз.\n\n' +
                'Выдача происходит автоматически.'

            await ctx.reply(warningMessage, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('Понятно, перейти к оплате', 'pay:tribute:confirm')],
                ]),
            })
        } catch (error) {
            logger.error('Error in pay:tribute warning action:', error)
            await ctx.reply('Извините, произошла ошибка.')
        }
    })

    // 4. Tribute — подтверждение и выдача ссылки
    bot.action('pay:tribute:confirm', async (ctx) => {
        try {
            await ctx.answerCbQuery().catch(() => {})

            const tributeUrl = process.env.TRIBUTE_URL
            if (!tributeUrl) {
                await ctx.reply('Извините, оплата через Tribute сейчас недоступна.')
                return
            }

            const message =
                '💳 <b>Оплата через Tribute</b>\n\n' +
                '1. Перейдите по кнопке ниже и оформите подписку (принимаются карты большинства стран мира).\n\n' +
                '2. После оплаты Tribute добавит вас в наш закрытый VIP-канал.\n\n' +
                '3. <b>Как только вы вступите в канал, этот бот автоматически активирует ваш полный доступ!</b>'

            await ctx.reply(message, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.url('Перейти к оплате Tribute', tributeUrl)],
                ]),
            })
        } catch (error) {
            logger.error('Error in pay:tribute:confirm action:', error)
            await ctx.reply('Извините, произошла ошибка при подготовке ссылки на Tribute.')
        }
    })

    // 5. Наблюдатель chat_member для автоматической активации/деактивации доступа.
    //
    // Продукт — доступ в ОДИН закрытый канал (PAID_CHANNEL_ID). Пользователи,
    // оплатившие через Boosty/Tribute, добавляются во внешнем сервисе прямо в
    // этот канал, поэтому отдельные каналы под Boosty/Tribute не нужны.
    // По умолчанию наблюдаемый канал = PAID_CHANNEL_ID; при желании можно задать
    // отдельные BOOSTY_CHANNEL_ID / TRIBUTE_CHANNEL_ID.
    bot.on('chat_member', async (ctx) => {
        try {
            const chatMember = ctx.chatMember
            const paidChannelId = process.env.PAID_CHANNEL_ID
            const boostyChannelId = process.env.BOOSTY_CHANNEL_ID || paidChannelId
            const tributeChannelId = process.env.TRIBUTE_CHANNEL_ID || paidChannelId

            const incomingChatId = String(ctx.chat.id)
            let provider: 'boosty' | 'tribute' | 'channel' | null = null
            if (boostyChannelId && incomingChatId === String(boostyChannelId)) {
                provider = 'boosty'
            } else if (tributeChannelId && incomingChatId === String(tributeChannelId)) {
                provider = 'tribute'
            } else if (paidChannelId && incomingChatId === String(paidChannelId)) {
                provider = 'channel'
            }

            // Событие пришло из постороннего чата — игнорируем
            if (!provider) {
                return
            }

            const providerLabel =
                provider === 'tribute' ? 'Tribute' : provider === 'boosty' ? 'Boosty' : 'канал'

            const userId = chatMember.new_chat_member.user.id
            const newStatus = chatMember.new_chat_member.status
            const telegramId = BigInt(userId)

            if (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator') {
                // ПОЛЬЗОВАТЕЛЬ ВСТУПИЛ (ОПЛАТИЛ или прошёл по инвайт-ссылке)
                await prisma.user.upsert({
                    where: { telegramId },
                    update: {
                        paid: true,
                        paymentDate: new Date(),
                        lastPaymentProvider: provider,
                    },
                    create: {
                        telegramId,
                        paid: true,
                        paymentDate: new Date(),
                        lastPaymentProvider: provider,
                    },
                })

                // Отдельное «спасибо» шлём только для внешних сервисов; при входе
                // по нашей инвайт-ссылке пользователь уже получил подтверждение.
                if (provider !== 'channel') {
                    await ctx.telegram
                        .sendMessage(
                            userId,
                            `🎉 <b>Оплата через ${providerLabel} подтверждена!</b>\n\n` +
                                'Доступ к закрытому каналу активирован.',
                            { parse_mode: 'HTML' },
                        )
                        .catch((err) =>
                            logger.error(`Failed to send success message to user ${userId}:`, err),
                        )
                }

                logger.info(`Access GRANTED to user ${userId} via ${providerLabel} membership.`)
            } else if (newStatus === 'left' || newStatus === 'kicked') {
                // ПОЛЬЗОВАТЕЛЬ ВЫШЕЛ (ОТПИСАЛСЯ / был исключён)
                const user = await prisma.user.findUnique({ where: { telegramId } })
                if (!user) {
                    return
                }
                // Не отзываем доступ, если есть активная оплаченная подписка
                // (например, куплена за звёзды/крипту с фиксированным сроком).
                if (user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
                    logger.info(
                        `User ${userId} left ${providerLabel} but has active subscription until ${user.subscriptionExpiry}. Access not revoked.`,
                    )
                    return
                }

                await prisma.user.update({
                    where: { telegramId },
                    data: { paid: false },
                })

                await ctx.telegram
                    .sendMessage(
                        userId,
                        `💔 <b>Подписка завершена</b>\n\n` +
                            'Вы покинули закрытый канал, поэтому доступ приостановлен. Вы всегда можете вернуться!',
                        { parse_mode: 'HTML' },
                    )
                    .catch((err) =>
                        logger.error(`Failed to send loss message to user ${userId}:`, err),
                    )

                logger.info(`Access REVOKED for user ${userId} (left ${providerLabel}).`)
            }
        } catch (error) {
            logger.error('Error in channel-membership chat_member observer:', error)
        }
    })
}
