import { Telegram } from 'telegraf'
import { logger } from '../utils/logger.js'

/**
 * Продукт бота — доступ в закрытый (платный) канал с контентом.
 *
 * После успешной оплаты бот генерирует ПЕРСОНАЛЬНУЮ ОДНОРАЗОВУЮ
 * пригласительную ссылку в канал (member_limit = 1) и отправляет её
 * пользователю. Для этого бот должен быть администратором канала с правом
 * приглашать пользователей по ссылке (can_invite_users).
 *
 * ID канала берётся из переменной окружения PAID_CHANNEL_ID
 * (формат: -1001234567890).
 */
export async function createChannelInviteLink(
    telegram: Telegram,
    telegramId: number | bigint,
): Promise<string | null> {
    const channelId = process.env.PAID_CHANNEL_ID
    if (!channelId) {
        logger.error('PAID_CHANNEL_ID is not set — cannot create invite link')
        return null
    }

    try {
        const invite = await telegram.createChatInviteLink(channelId, {
            name: `sub-${telegramId}-${Date.now()}`.slice(0, 32),
            member_limit: 1,
        })
        return invite.invite_link
    } catch (error) {
        logger.error(`Failed to create channel invite link for user ${telegramId}:`, error)
        return null
    }
}

/**
 * Grants access after a successful payment: creates a one-time invite link and
 * sends it to the user. Returns the link (or null if it could not be created).
 */
export async function grantChannelAccess(
    telegram: Telegram,
    telegramId: number | bigint,
    expiryText?: string,
): Promise<string | null> {
    const link = await createChannelInviteLink(telegram, telegramId)

    if (!link) {
        // Fall back to a plain confirmation so the buyer is not left hanging.
        await telegram
            .sendMessage(
                Number(telegramId),
                '✅ <b>Оплата подтверждена!</b>\n\n' +
                    'Не удалось автоматически сгенерировать ссылку на канал. ' +
                    'Пожалуйста, напишите менеджеру — вам выдадут доступ вручную.',
                { parse_mode: 'HTML' },
            )
            .catch((err) => logger.error('Failed to send fallback access message:', err))
        return null
    }

    const expiryLine = expiryText ? `\n\n🗓 Подписка активна до: <b>${expiryText}</b>` : ''

    await telegram
        .sendMessage(
            Number(telegramId),
            '🎉 <b>Оплата подтверждена! Доступ открыт.</b>\n\n' +
                'Нажмите на кнопку ниже, чтобы вступить в закрытый канал с контентом. ' +
                '<i>Ссылка персональная и работает один раз.</i>' +
                expiryLine,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔓 Вступить в канал', url: link }]],
                },
            },
        )
        .catch((err) => logger.error(`Failed to send invite link to user ${telegramId}:`, err))

    return link
}
