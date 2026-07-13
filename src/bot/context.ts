import { Context } from 'telegraf'
import type { MessageEntity } from 'telegraf/types'
import { User, AbConfig } from '../db/prisma.js'

/**
 * A single unit of content to broadcast. Text is sent as an HTML message;
 * media kinds carry a Telegram `fileId` (already uploaded to Telegram once,
 * then reused across all recipients — no per-user upload).
 */
export type BroadcastKind =
    | 'text'
    | 'photo'
    | 'video'
    | 'video_note'
    | 'document'
    | 'voice'
    | 'audio'
    | 'animation'
    | 'sticker'

export interface BroadcastPayload {
    kind: BroadcastKind
    text?: string
    fileId?: string
    // Short caption attached to the media itself (Telegram limit: 1024 chars).
    caption?: string
    // Optional text message sent as a separate message right after the media.
    // Used for long texts that do not fit into a caption (limit: 4096 chars).
    followupText?: string
    // Formatting (bold, italic, links, custom/premium emoji, …) as delivered by
    // Telegram for the admin's message. Preserving these instead of relying on
    // parse_mode keeps the broadcast identical to what the admin typed.
    // `entities` applies to `text` / `followupText`; `captionEntities` to `caption`.
    entities?: MessageEntity[]
    captionEntities?: MessageEntity[]
    followupEntities?: MessageEntity[]
}

export interface MySession {
    adminState?: {
        type: 'wait_price' | 'wait_group_name' | 'wait_group_price' | 'wait_group_param_value'
        groupName?: string
        param?: string
    }
    broadcastState?: {
        step: 'await_content' | 'await_followup' | 'await_confirm'
        payload?: BroadcastPayload
    }
    commandsSet?: boolean
}

export interface MyContext extends Context {
    session: MySession
    language?: 'ru'
    role?: 'USER' | 'ADMIN'
    abGroup?: string
    price?: number
    abConfig?: AbConfig | null
    user?: User
}
