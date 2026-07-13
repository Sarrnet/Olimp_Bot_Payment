import { Queue, Worker, Job } from 'bullmq'
import { redis } from './redis.js'
import { logger } from '../utils/logger.js'
import { Telegram } from 'telegraf'
import type { MessageEntity } from 'telegraf/types'
import type { BroadcastPayload } from '../bot/context.js'

const BROADCAST_QUEUE_NAME = 'admin-broadcast'

const defaultOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000, // 2s start
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for manual review if they exhausted retries
}

export const broadcastQueue = new Queue(BROADCAST_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: defaultOptions,
})

/** True when the error is Telegram rejecting a custom (premium) emoji entity. */
function isCustomEmojiError(error: any): boolean {
    const desc: string = error?.description || error?.message || ''
    return /custom.?emoji/i.test(desc)
}

/** Drops custom (premium) emoji entities, keeping every other formatting entity. */
function stripCustomEmoji(entities?: MessageEntity[]): MessageEntity[] | undefined {
    if (!entities) return undefined
    return entities.filter((e) => e.type !== 'custom_emoji')
}

/**
 * Sends a text message preserving the admin's formatting via `entities`
 * (bold, italic, links, custom/premium emoji, …). When no entities are present
 * we fall back to HTML parsing for backward compatibility with legacy jobs.
 * If Telegram refuses a premium emoji (the bot may not be allowed to send it),
 * we retry once with those entities stripped so the rest of the message still
 * goes out instead of failing the whole broadcast.
 */
async function sendFormattedMessage(
    telegram: Telegram,
    chatId: number,
    text: string,
    entities?: MessageEntity[],
) {
    if (!entities || entities.length === 0) {
        await telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
        return
    }
    try {
        await telegram.sendMessage(chatId, text, { entities })
    } catch (error) {
        if (!isCustomEmojiError(error)) throw error
        await telegram.sendMessage(chatId, text, { entities: stripCustomEmoji(entities) })
    }
}

/**
 * Sends one broadcast item to a single recipient, dispatching by content kind.
 * Media is delivered by `fileId` (already uploaded to Telegram), so nothing is
 * re-uploaded per recipient. Video notes and stickers ignore captions because
 * Telegram does not support them for those types.
 */
export async function sendBroadcastItem(
    telegram: Telegram,
    chatId: number,
    payload: BroadcastPayload,
) {
    const caption = payload.caption
    // Prefer entities (rich formatting + premium emoji as composed by the admin)
    // over parse_mode; only fall back to HTML when no entities were captured.
    const captionEntities = payload.captionEntities
    const captionOpts = caption
        ? captionEntities && captionEntities.length > 0
            ? { caption, caption_entities: captionEntities }
            : { caption, parse_mode: 'HTML' as const }
        : undefined

    // Retries media captions once without premium emoji if Telegram rejects them.
    const sendMedia = async (send: (opts: any) => Promise<unknown>) => {
        try {
            await send(captionOpts)
        } catch (error) {
            if (!captionEntities?.length || !isCustomEmojiError(error)) throw error
            await send({ caption, caption_entities: stripCustomEmoji(captionEntities) })
        }
    }

    switch (payload.kind) {
        case 'text':
            await sendFormattedMessage(telegram, chatId, payload.text || '', payload.entities)
            break
        case 'photo':
            await sendMedia((opts) => telegram.sendPhoto(chatId, payload.fileId!, opts))
            break
        case 'video':
            await sendMedia((opts) => telegram.sendVideo(chatId, payload.fileId!, opts))
            break
        case 'document':
            await sendMedia((opts) => telegram.sendDocument(chatId, payload.fileId!, opts))
            break
        case 'voice':
            await sendMedia((opts) => telegram.sendVoice(chatId, payload.fileId!, opts))
            break
        case 'audio':
            await sendMedia((opts) => telegram.sendAudio(chatId, payload.fileId!, opts))
            break
        case 'animation':
            await sendMedia((opts) => telegram.sendAnimation(chatId, payload.fileId!, opts))
            break
        case 'video_note':
            await telegram.sendVideoNote(chatId, payload.fileId!)
            break
        case 'sticker':
            await telegram.sendSticker(chatId, payload.fileId!)
            break
        default:
            throw new Error(`Unsupported broadcast kind: ${(payload as BroadcastPayload).kind}`)
    }

    // For media broadcasts, a long text can be attached as a separate message
    // (sent right after the file) so it is not constrained by the 1024-char
    // caption limit.
    if (payload.kind !== 'text' && payload.followupText) {
        await sendFormattedMessage(telegram, chatId, payload.followupText, payload.followupEntities)
    }
}

export function setupQueues(telegram: Telegram) {
    // Broadcast Worker
    const broadcastWorker = new Worker(
        BROADCAST_QUEUE_NAME,
        async (job: Job) => {
            const { telegramId } = job.data
            // Backward compatible: legacy jobs carried a plain `message` string.
            const payload: BroadcastPayload = job.data.payload || {
                kind: 'text',
                text: job.data.message,
            }
            try {
                await sendBroadcastItem(telegram, Number(telegramId), payload)
            } catch (error: any) {
                const desc: string = error.description || error.message || ''
                if (
                    desc.includes('bot was blocked') ||
                    desc.includes('user is deactivated') ||
                    desc.includes('chat not found')
                ) {
                    logger.info(`User ${telegramId} unreachable (${desc}). Skipping broadcast.`)
                    return // Don't retry if the user can no longer be reached
                }
                throw error // Let BullMQ retry for other errors (network, 429, 5xx)
            }
        },
        { connection: redis, concurrency: 5 }, // 5 parallel messages
    )

    broadcastWorker.on('failed', (job, err) => {
        logger.error(
            `Broadcast job ${job?.id} failed for user ${job?.data.telegramId}: ${err.message}`,
        )
    })

    return { broadcastWorker }
}
